import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router, requireRole, requirePermissionFlag } from "../_core/trpc";
import * as db from "../db";
import { sql, and, eq, gte, desc } from "drizzle-orm";
import { attendanceEvents, type UserRole } from "../../drizzle/schema";
import { ROLE_PERMISSIONS, hasPageAccess, canApproveBatchAtStage, cannotSelfReview } from "../permissions";
import { generateAttendanceExcel, generatePayrollExcel, type AttendanceReportRow, type PayrollReportRow } from "../excelExport";
import { parseGroupsFromExcel, parseWorkersFromExcel, generateGroupsExcelTemplate, generateWorkersExcelTemplate, generateGroupsExcelExport, generateWorkersExcelExport } from "../excelImportExport";
import * as analytics from "../analytics";
import { sendNotification } from "../notifications";
import * as QRCode from "qrcode";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

  // Payroll Batches
export const payrollRouter = router({
    // Create draft batch
    createBatch: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
        refreshFinanceRecords: z.boolean().optional(), // ✅ NEW: إعادة حساب السجلات المالية
        groupIds: z.array(z.number()).optional(), // ✅ المجموعات المختارة
        items: z.array(z.object({
          workerId: z.number(),
          baseAmount: z.string(),
          deductions: z.string(),
          bonuses: z.string(),
          netAmount: z.string(),
          daysWorked: z.number().optional(),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Role check: only admin_affairs, accountant, super_admin can create batches
        const userRole = ctx.user.role as UserRole;
        const perms = ROLE_PERMISSIONS[userRole];
        if (!perms?.canCreateBatch) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية إنشاء دفعات العمال' });
        }
        
        // === شرط 1: منع تكرار الدفعة لنفس الفترة ومركز التكلفة والمجموعات ===
        const duplicateCheck = await db.checkDuplicatePayrollBatch(
          input.periodStart,
          input.periodEnd,
          input.costCenterId ?? null,
          input.groupIds  // ✅ تمرير المجموعات المختارة للتحقق من التداخل
        );
        if (duplicateCheck.isDuplicate) {
          throw new Error(
            `لا يمكن إنشاء دفعة العمال. توجد دفعة سابقة (${duplicateCheck.existingBatchCode}) تحتوي على مجموعات متداخلة مع مجموعاتك المختارة لنفس الفترة.\n\nالحالة: ${duplicateCheck.existingStatus}\n\nيرجى إزالة المجموعات المكررة أو اختيار مجموعات مختلفة.`
          );
        }
        
        // === شرط 2: فحص البلاغات التشغيلية المعلقة لنفس الفترة ومركز التكلفة (مقصور على المجموعات المختارة) ===
        const pendingFlagsCount = await db.getPendingOperationalFlagsForPeriod(
          input.periodStart,
          input.periodEnd,
          input.costCenterId ?? null,
          input.groupIds
        );
        if (pendingFlagsCount > 0) {
          throw new Error(
            `لا يمكن إنشاء دفعة العمال. يوجد ${pendingFlagsCount} ملاحظة تشغيلية معلقة لنفس الفترة ومركز التكلفة تحتاج للمعالجة.\n\nيرجى مراجعة واعتماد جميع الملاحظات التشغيلية المعلقة في صفحة "معالجات الملاحظات التشغيلية" قبل إنشاء دفعة الرواتب.`
          );
        }
        
        // === شرط 3: فحص البصمات الناقصة لنفس الفترة ومركز التكلفة ===
        const startDate = new Date(input.periodStart);
        const endDate = new Date(input.periodEnd);
        
        const incompleteCheck = await db.checkIncompleteAttendanceForPeriodAndCostCenter(
          startDate,
          endDate,
          input.costCenterId ?? null,
          input.groupIds
        );
        
        if (incompleteCheck.hasIncomplete) {
          const errorDetails = incompleteCheck.incompleteRecords
            .slice(0, 10) // Show first 10 records
            .map(r => `${r.date}: ${r.workerName} (${r.workerCode}) - ${r.incompleteType}`)
            .join('\n');
          
          const moreCount = incompleteCheck.incompleteCount - 10;
          const moreText = moreCount > 0 ? `\n... و ${moreCount} سجل آخر` : '';
          
          throw new Error(
            `لا يمكن إنشاء دفعة العمال. يوجد ${incompleteCheck.incompleteCount} سجل حضور ناقص لنفس الفترة ومركز التكلفة يحتاج للمعالجة:\n\n${errorDetails}${moreText}\n\nيرجى مراجعة البصمات الناقصة في "مركز مراجعة البصمات" قبل إنشاء دفعة العمال.`
          );
        }
        
        const result = await db.createPayrollBatch({
          ...input,
          createdBy: ctx.user.id,
        });
        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'CREATE_PAYROLL_BATCH',
          tableName: 'payroll_batches',
          recordId: result.batchId,
          newValues: { periodStart: input.periodStart, periodEnd: input.periodEnd, costCenterId: input.costCenterId, itemsCount: input.items.length },
        });
        return result;
      }),
    
    // Get payroll batches with search and filtering
    getPayrollBatches: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        statusFilter: z.string().optional(),
        costCenterFilter: z.number().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        sortBy: z.enum(['date', 'batchId', 'totalAmount']).optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getPayrollBatches({
          search: input.search,
          statusFilter: input.statusFilter,
          costCenterFilter: input.costCenterFilter,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          sortBy: input.sortBy || 'date',
          sortOrder: input.sortOrder || 'desc',
          limit: input.limit || 10,
          offset: input.offset || 0,
        });
      }),
    
    // List all batches
    listBatches: protectedProcedure
      .input(z.object({
        costCenterId: z.number().optional(),
        groupId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(10),
      }))
      .query(async ({ input }) => {
        const filters: any = {};
        if (input.costCenterId) filters.costCenterId = input.costCenterId;
        if (input.groupId) filters.groupId = input.groupId;
        if (input.startDate) filters.startDate = new Date(input.startDate);
        if (input.endDate) filters.endDate = new Date(input.endDate);
        
        const offset = (input.page - 1) * input.limit;
        const batches = await db.getBatchesByStatus(undefined, filters);
        
        // Simple pagination (can be optimized in db layer later)
        const total = batches.length;
        const paginatedBatches = batches.slice(offset, offset + input.limit);
        
        return {
          data: paginatedBatches,
          total,
          page: input.page,
          limit: input.limit,
          totalPages: Math.ceil(total / input.limit),
        };
      }),
    
    // List batches by status
    listBatchesByStatus: protectedProcedure
      .input(z.object({ status: z.string() }))
      .query(async ({ input }) => {
        return await db.getBatchesByStatus(input.status);
      }),

    // تقرير تغطية المجموعات: المجموعات التي فاتها إنشاء دفعة رواتب حسب الحضور الفعلي
    getGroupCoverageReport: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getGroupCoverageReport(input);
      }),
    
    // Get batch details
    getDetails: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        return await db.getPayrollBatchDetails(input.batchId);
      }),
    
    // Update batch item (DRAFT or RETURNED only)
    updateItem: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        baseAmount: z.string().optional(),
        totalDeductions: z.string().optional(),
        totalBonuses: z.string().optional(),
        notes: z.string().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const result = await db.updateBatchItem(input);
        await db.logAudit({ userId: ctx.user?.id, action: 'UPDATE_PAYROLL_ITEM', tableName: 'payroll_batches', recordId: input.itemId, newValues: { baseAmount: input.baseAmount, totalDeductions: input.totalDeductions, totalBonuses: input.totalBonuses, notes: input.notes } });
        return result;
      }),
    
    // Submit for accountant review
    // إرسال المسودة للمحاسب (الشؤون الإدارية فقط)
    submitForReview: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        // فقط الشؤون الإدارية والسوبر أدمن يمكنهم إرسال المسودة
        if (!ROLE_PERMISSIONS[userRole]?.canSubmitDraft) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط الشؤون الإدارية يمكنهم إرسال الدفعة للمراجعة' });
        }
        const result = await db.submitBatchForReview(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'SUBMIT_PAYROLL_FOR_REVIEW', tableName: 'payroll_batches', recordId: input.batchId });
        return result;
      }),
    
    // Accountant approve
    accountantApprove: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAccountant) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المحاسب المالي يمكنه اعتماد الدفعة في هذه المرحلة' });
        }
        // Check self-review prevention
        const batch = await db.getPayrollBatchDetails(input.batchId);
        if (batch?.batch && batch.batch.createdBy && cannotSelfReview(batch.batch.createdBy, ctx.user.id, userRole)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكنك مراجعة دفعة قمت بإنشائها بنفسك' });
        }
        const result = await db.accountantApproveBatch(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'ACCOUNTANT_APPROVE_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId });
        return result;
      }),
    
    // Accountant reject
    accountantReject: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        noteType: z.enum(['critical', 'warning', 'info']),
        note: z.string(),
        workerId: z.number().optional(),
        fieldName: z.string().optional(),
        attachmentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAccountant) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المحاسب المالي يمكنه رفض الدفعة في هذه المرحلة' });
        }
        const result = await db.accountantRejectBatch({
          ...input,
          reviewerId: ctx.user.id,
        });
        await db.logAudit({ userId: ctx.user.id, action: 'ACCOUNTANT_REJECT_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId, newValues: { note: input.note } });
        return result;
      }),
    
    // Financial reviewer approve (Auditor)
    financialReviewerApprove: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAuditor) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المراجع المالي يمكنه اعتماد الدفعة في هذه المرحلة' });
        }
        const result = await db.financialReviewerApproveBatch(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'AUDITOR_APPROVE_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId });
        return result;
      }),
    
    // Financial reviewer reject
    financialReviewerReject: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        noteType: z.enum(['critical', 'warning', 'info']),
        note: z.string(),
        workerId: z.number().optional(),
        fieldName: z.string().optional(),
        attachmentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAuditor) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المراجع المالي يمكنه رفض الدفعة في هذه المرحلة' });
        }
        const result = await db.financialReviewerRejectBatch({
          ...input,
          reviewerId: ctx.user.id,
        });
        await db.logAudit({ userId: ctx.user.id, action: 'AUDITOR_REJECT_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId, newValues: { note: input.note } });
        return result;
      }),
    
    // Finance Manager final approve
    accountsManagerApprove: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canApproveAsFM) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير المالي يمكنه الاعتماد النهائي للدفعة' });
        }
        const result = await db.accountsManagerApproveBatch(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'FM_APPROVE_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId });
        return result;
      }),
    
    // Accounts manager final reject
    accountsManagerReject: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        note: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canApproveAsFM) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير المالي يمكنه رفض الدفعة في هذه المرحلة' });
        }
        const result = await db.accountsManagerRejectBatch({
          ...input,
          reviewerId: ctx.user.id,
        });
        await db.logAudit({ userId: ctx.user.id, action: 'FM_REJECT_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId, newValues: { note: input.note } });
        return result;
      }),
    
    // Delete batch (DRAFT: admin_affairs + super_admin, Non-DRAFT: super_admin only)
    deleteBatch: protectedProcedure
      .input(z.object({ batchId: z.number(), forceDelete: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        if (input.forceDelete) {
          // الحذف النهائي: فقط super_admin
          if (ctx.user.role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'الحذف النهائي متاح فقط للمسؤول الأعلى (Super Admin)' });
          }
          const result1 = await db.deleteBatch(input.batchId, true);
          await db.logAudit({ userId: ctx.user.id, action: 'FORCE_DELETE_PAYROLL_BATCH', tableName: 'payroll_batches', recordId: input.batchId });
          return result1;
        } else {
          // حذف المسودات: super_admin + admin_affairs
          if (ctx.user.role !== 'super_admin' && ctx.user.role !== 'admin_affairs') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'لا تملك صلاحية حذف دفعات العمال' });
          }
          const result2 = await db.deleteBatch(input.batchId, false);
          await db.logAudit({ userId: ctx.user.id, action: 'DELETE_PAYROLL_BATCH', tableName: 'payroll_batches', recordId: input.batchId });
          return result2;
        }
      }),
    
    // Export batch details to Excel
    exportBatchDetailsToExcel: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input }) => {
        const { generateBatchDetailsExcel } = await import('../excel-export');
        
        // Get batch details
        const batchDetails = await db.getPayrollBatchDetails(input.batchId);
        const batch = batchDetails.batch;
        if (!batch) throw new Error('دفعة العمال غير موجودة');
        
        // Get all workers in this batch
        const items = batchDetails.items;
        const workers = await Promise.all(
          items.map(async (item: any) => {
            const worker = await db.getWorkerById(item.workerId);
            return {
              workerId: item.workerId,
              workerName: worker?.fullName || 'غير معروف',
              workerCode: worker?.code || '-',
            };
          })
        );
        
        // Generate Excel file
        const buffer = await generateBatchDetailsExcel(
          input.batchId,
          batch.batchCode || `Batch-${input.batchId}`,
          batch.periodStart.toLocaleDateString('en-CA'),
          batch.periodEnd.toLocaleDateString('en-CA'),
          workers
        );
        
        // Return base64 encoded buffer
        return {
          data: buffer.toString('base64'),
          filename: `تفاصيل-${batch.batchCode || input.batchId}.xlsx`,
        };
      }),
    
    // Force unlock payroll batch (super_admin only)
    forceUnlock: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        reason: z.string().min(10, 'يجب إدخال سبب واضح (10 أحرف على الأقل)'),
      }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        const result = await db.forceUnlockPayroll(input.batchId, input.reason, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'FORCE_UNLOCK_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId, newValues: { reason: input.reason } });
        return result;
      }),
    
    // Re-lock payroll batch (super_admin only)
    relock: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        const relockResult = await db.relockPayroll(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'RELOCK_PAYROLL', tableName: 'payroll_batches', recordId: input.batchId });
        return relockResult;
      }),
    
    // Workflow: Submit to accounting (الشؤون الإدارية ترسل المسودة للمحاسب)
    submitToAccounting: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canSubmitDraft) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط الشؤون الإدارية يمكنهم إرسال الدفعة للمحاسب' });
        }
        return await db.submitBatchToAccounting(input.batchId, ctx.user.id);
      }),
    
    // Workflow: Submit to final review (المحاسب يعتمد ويرسل للمراجع)
    submitToFinalReview: protectedProcedure
      .input(z.object({ batchId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAccountant) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المحاسب المالي يمكنه إرسال الدفعة للمراجع' });
        }
        const fReviewResult = await db.submitBatchToFinalReview(input.batchId, ctx.user.id, input.reason);
        await db.logAudit({ userId: ctx.user.id, action: 'SUBMIT_TO_FINAL_REVIEW', tableName: 'payroll_batches', recordId: input.batchId });
        return fReviewResult;
      }),
    
    // Workflow: Submit for approval (المراجع يعتمد ويرسل للمدير المالي)
    submitForApproval: protectedProcedure
      .input(z.object({ batchId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canReviewAsAuditor) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المراجع المالي يمكنه إرسال الدفعة للمدير المالي' });
        }
        const approvalResult = await db.submitBatchForApproval(input.batchId, ctx.user.id, input.reason);
        await db.logAudit({ userId: ctx.user.id, action: 'SUBMIT_FOR_APPROVAL', tableName: 'payroll_batches', recordId: input.batchId });
        return approvalResult;
      }),
    
    // Workflow: Approve batch (المدير المالي فقط)
    approveBatchFinal: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canApproveAsFM) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير المالي يمكنه الاعتماد النهائي للدفعة' });
        }
        const approveFinalResult = await db.approveBatch(input.batchId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'APPROVE_BATCH_FINAL', tableName: 'payroll_batches', recordId: input.batchId });
        return approveFinalResult;
      }),
    
    // Workflow: Reject batch (المدير المالي يرفض → تعود draft للشؤون الإدارية)
    rejectBatchFinal: protectedProcedure
      .input(z.object({ batchId: z.number(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const userRole = ctx.user.role as UserRole;
        if (!ROLE_PERMISSIONS[userRole]?.canApproveAsFM) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'فقط المدير المالي يمكنه رفض الدفعة في هذه المرحلة' });
        }
        const rejectFinalResult = await db.rejectBatch(input.batchId, ctx.user.id, input.reason);
        await db.logAudit({ userId: ctx.user.id, action: 'REJECT_BATCH_FINAL', tableName: 'payroll_batches', recordId: input.batchId, newValues: { reason: input.reason } });
        return rejectFinalResult;
      }),
    
    // Get official payroll report by group
    getReportByGroup: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getPayrollReportByGroup(input.periodStart, input.periodEnd, input.groupId, input.costCenterId);
      }),
    
    // Get official payroll report by worker
    getReportByWorker: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        workerId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getPayrollReportByWorker(input.periodStart, input.periodEnd, input.workerId);
      }),
    
    // Get official payroll report by cost center
    getReportByCostCenter: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getPayrollReportByCostCenter(input.periodStart, input.periodEnd, input.costCenterId);
      }),
    
    // Get official payroll report summary (all groups)
    getReportSummary: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterId: z.number().optional(),
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getPayrollReportSummary(input.periodStart, input.periodEnd, input.costCenterId, input.groupId);
      }),
    
    // Export batch to Excel
    exportToExcel: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input }) => {
        const batchData = await db.getPayrollBatchDetails(input.batchId);
        
        if (!batchData || !batchData.batch) {
          throw new Error('Batch not found');
        }
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('دفعة الرواتب');
        
        // Set RTL
        worksheet.views = [{ rightToLeft: true }];
        
        // Add header info
        worksheet.mergeCells('A1:G1');
        worksheet.getCell('A1').value = `دفعة رواتب #${batchData.batch.batchCode}`;
        worksheet.getCell('A1').font = { size: 16, bold: true };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        
        worksheet.mergeCells('A2:G2');
        worksheet.getCell('A2').value = `الفترة: ${new Date(batchData.batch.periodStart).toLocaleDateString('ar-SA')} - ${new Date(batchData.batch.periodEnd).toLocaleDateString('ar-SA')}`;
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        
        // Add empty row
        worksheet.addRow([]);
        
        // Group items by groupId
        const groupedItems = batchData.items?.reduce((acc: any, item: any) => {
          const groupKey = item.groupId || 'unknown';
          if (!acc[groupKey]) {
            acc[groupKey] = {
              groupId: item.groupId,
              groupName: item.groupName || 'مجموعة غير محددة',
              workers: [],
              summary: {
                count: 0,
                totalBase: 0,
                totalDeductions: 0,
                totalBonuses: 0,
                totalNet: 0,
              },
            };
          }
          acc[groupKey].workers.push(item);
          acc[groupKey].summary.count += 1;
          acc[groupKey].summary.totalBase += parseFloat(item.baseAmount || '0');
          acc[groupKey].summary.totalDeductions += parseFloat(item.totalDeductions || '0');
          acc[groupKey].summary.totalBonuses += parseFloat(item.totalBonuses || '0');
          acc[groupKey].summary.totalNet += parseFloat(item.netAmount || '0');
          return acc;
        }, {});
        
        const groups = Object.values(groupedItems || {});
        
        // Add table header
        const headerRow = worksheet.addRow(['اسم العامل / المجموعة', ' المبلغ', 'الخصومات', 'الإضافات', 'الصافي', 'أيام العمل', 'ملاحظات']);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
        
        // Add data grouped by groups
        groups.forEach((group: any) => {
          // Group summary row
          const summaryRow = worksheet.addRow([
            `${group.groupName} (${group.summary.count} عامل)`,
            group.summary.totalBase.toFixed(2),
            group.summary.totalDeductions.toFixed(2),
            group.summary.totalBonuses.toFixed(2),
            group.summary.totalNet.toFixed(2),
            '',
            ''
          ]);
          summaryRow.font = { bold: true };
          summaryRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
          };
          
          // Worker rows
          group.workers.forEach((worker: any) => {
            worksheet.addRow([
              `  ${worker.workerName}`,
              parseFloat(worker.baseAmount).toFixed(2),
              parseFloat(worker.totalDeductions).toFixed(2),
              parseFloat(worker.totalBonuses).toFixed(2),
              parseFloat(worker.netAmount).toFixed(2),
              worker.daysWorked || 0,
              worker.notes || '-'
            ]);
          });
        });
        
        // Set column widths
        worksheet.columns = [
          { width: 30 },
          { width: 15 },
          { width: 15 },
          { width: 15 },
          { width: 15 },
          { width: 12 },
          { width: 30 }
        ];
        
        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        // Return base64 encoded file
        const bufferData = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
        return {
          filename: `payroll_${batchData.batch.batchCode}_${Date.now()}.xlsx`,
          data: bufferData.toString('base64')
        };
      }),
    
    // Get daily finance records for a worker in a batch
    getDailyFinanceForWorker: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getDailyFinanceForWorker(input.workerId, input.periodStart, input.periodEnd);
      }),
    
    // Get attendance events for a worker in a period
    getAttendanceForWorkerPeriod: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getAttendanceForWorkerPeriod(input.workerId, input.periodStart, input.periodEnd);
      }),

    
    calculateDailyFinancesForPeriod: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await db.calculateDailyFinancesForPeriod(
          input.workerId,
          input.periodStart,
          input.periodEnd
        );
      }),
    
    getUnlockedDailyFinances: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getUnlockedDailyFinances(
          input.workerId,
          input.periodStart,
          input.periodEnd
        );
      }),
    
    aggregatePayrollData: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.aggregatePayrollData(
          input.workerId,
          input.periodStart,
          input.periodEnd
        );
      }),
    
    checkLockedDaysInPeriod: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.checkLockedDaysInPeriod(
          input.workerId,
          input.periodStart,
          input.periodEnd
        );
      }),
    
    aggregatePayrollDataByCostCenter: protectedProcedure
      .input(z.object({
        costCenterId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        groupIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.aggregatePayrollDataByCostCenter(
          input.costCenterId,
          input.periodStart,
          input.periodEnd,
          input.groupIds
        );
      }),
    
    // Add note to batch
    addBatchNote: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        noteType: z.enum(['critical', 'warning', 'info']),
        note: z.string(),
        errorLocation: z.string().optional(),
        workerId: z.number().optional(),
        fieldName: z.string().optional(),
        attachmentUrl: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const { addBatchNote } = await import('../db_batch_notes');
        const noteResult = await addBatchNote({
          ...input,
          userId: ctx.user.id,
          userRole: ctx.user.role || 'guard',
        });
        await db.logAudit({ userId: ctx.user.id, action: 'ADD_BATCH_NOTE', tableName: 'payroll_batches', recordId: input.batchId, newValues: { noteType: input.noteType, fieldName: input.fieldName } });
        return noteResult;
      }),
    
    // Get notes for a batch
    getBatchNotes: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const { getBatchNotes } = await import('../db_batch_notes');
        return await getBatchNotes(input.batchId);
      }),

    // ============================================
    // Assignment Settlements (تسويات الانتدابات)
    // ============================================

    // فحص الانتدابات النشطة في دفعة معينة
    checkBatchAssignments: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        return await db.checkBatchAssignments(input.batchId);
      }),

    // تطبيق تسويات الانتدابات
    applyAssignmentSettlements: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        assignmentIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const result = await db.applyAssignmentSettlements({
          ...input,
          appliedBy: ctx.user.id,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'APPLY_ASSIGNMENT_SETTLEMENTS',
          tableName: 'assignment_settlements',
          recordId: input.batchId,
newValues: { assignmentIds: input.assignmentIds, settlements: result.settlements },
        });
        return result;
      }),

    // ✅ جديد: إضافة بصمة يدوية من داخل مسودة الدفعة
    addManualAttendance: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        workerId: z.number(),
        workDate: z.string(),
        eventType: z.enum(['check_in', 'check_out']),
        eventTime: z.string(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const batchDetails = await db.getPayrollBatchDetails(input.batchId);
        if (!batchDetails) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدفعة غير موجودة' });
        if (batchDetails.batch.status !== 'draft') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن تعديل الحضور إلا في مسودة الدفعة' });
        }
        const result = await db.addManualAttendanceForBatch({
          workerId: input.workerId,
          workDate: input.workDate,
          eventType: input.eventType,
          eventTime: input.eventTime,
          addedBy: ctx.user.id,
          note: input.note,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'ADD_MANUAL_ATTENDANCE_BATCH',
          tableName: 'attendance_events',
          recordId: result.eventId,
          newValues: { workerId: input.workerId, workDate: input.workDate, eventType: input.eventType, eventTime: input.eventTime },
        });
        return result;
      }),

    // ✅ جديد: تعديل وقت بصمة من داخل مسودة الدفعة
    updateAttendanceForBatch: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        eventId: z.number(),
        newTime: z.string(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const batchDetails = await db.getPayrollBatchDetails(input.batchId);
        if (!batchDetails) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدفعة غير موجودة' });
        if (batchDetails.batch.status !== 'draft') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن تعديل الحضور إلا في مسودة الدفعة' });
        }
        const result = await db.updateAttendanceEventForBatch({
          eventId: input.eventId,
          newTime: input.newTime,
          updatedBy: ctx.user.id,
          note: input.note,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'UPDATE_ATTENDANCE_BATCH',
          tableName: 'attendance_events',
          recordId: input.eventId,
          newValues: { newTime: input.newTime, note: input.note },
        });
        return result;
      }),

    // ✅ جديد: تحديث ملاحظة عامل في دفعة الدفعة
    updateWorkerNote: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        note: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        return await db.updatePayrollItemNote(input.itemId, input.note);
      }),

    // جلب العمال الغائبين عن الدفعة في تاريخ معين
    getAbsentWorkersForBatch: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        workDate: z.string(),
        batchId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getAbsentWorkersForBatch(input.groupId, input.workDate, input.batchId);
      }),

    // إضافة عامل جديد للدفعة مع بصماته
    addWorkerToBatch: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        workerId: z.number(),
        workDate: z.string(),
        checkInTime: z.string(),
        checkOutTime: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const batchDetails = await db.getPayrollBatchDetails(input.batchId);
        if (!batchDetails) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدفعة غير موجودة' });
        if (batchDetails.batch.status !== 'draft') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن التعديل إلا في مسودة الدفعة' });
        }
        const result = await db.addWorkerToBatch({
          ...input,
          addedBy: ctx.user.id,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'ADD_WORKER_TO_BATCH',
          tableName: 'payroll_batch_items',
          recordId: input.batchId,
          newValues: { workerId: input.workerId, workDate: input.workDate },
        });
        return result;
      }),

    // جلب العمال الحاضرين فعلياً في مجموعة (قد تنتمي لمركز تكلفة آخر) بتاريخ معين
    // تُستخدم في نافذة "إضافة عامل من مركز آخر"
    getPresentWorkersForGroupDate: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        workDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getPresentWorkersForGroupOnDate(input.groupId, input.workDate);
      }),

    // إضافة عامل من مركز/مجموعة أخرى إلى الدفعة الحالية ليوم واحد (عبر انتداب مؤقت تلقائي)
    addWorkerFromOtherGroup: protectedProcedure
      .input(z.object({
        batchId: z.number(),
        targetGroupId: z.number(),
        workerId: z.number(),
        workDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const batchDetails = await db.getPayrollBatchDetails(input.batchId);
        if (!batchDetails) throw new TRPCError({ code: 'NOT_FOUND', message: 'الدفعة غير موجودة' });
        if (batchDetails.batch.status !== 'draft') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'لا يمكن التعديل إلا في مسودة الدفعة' });
        }
        const result = await db.addWorkerFromOtherGroup({
          batchId: input.batchId,
          targetGroupId: input.targetGroupId,
          workerId: input.workerId,
          workDate: input.workDate,
          addedBy: ctx.user.id,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'ADD_WORKER_FROM_OTHER_GROUP_TO_BATCH',
          tableName: 'payroll_batch_items',
          recordId: input.batchId,
          newValues: { workerId: input.workerId, workDate: input.workDate, targetGroupId: input.targetGroupId },
        });
        return result;
      }),
}); // ← هذا يغلق قسم payroll
