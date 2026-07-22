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

  // Pay Overrides (Exceptions)
export const payOverridesRouter = router({
    // Create new override
    create: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        overrideDate: z.string(),
        overrideType: z.enum(['bonus', 'deduction', 'advance', 'emergency_call']),
        amount: z.number().positive(),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Check if payroll batch exists for this date
        // ✅ القفل مرتبط بالتاريخ + مجموعة العامل
        const poWorker = await db.getWorkerById(input.workerId);
        const batch = await db.checkPayrollBatchForDate(input.overrideDate, poWorker?.groupId ?? undefined);
        if (batch) {
          throw new Error(`لا يمكن إضافة خصومات أو إضافات بعد إنشاء دفعة العمال لمجموعة هذا العامل. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
        }
        
        // Get worker name for audit log
        const worker = await db.getWorkerById(input.workerId);
        const workerName = worker?.fullName || `عامل رقم ${input.workerId}`;
        
        const result = await db.createPayOverride({
          ...input,
          createdBy: ctx.user.id,
        });
        await db.logAudit({ userId: ctx.user.id, action: 'CREATE_PAY_OVERRIDE', tableName: 'pay_overrides', newValues: { workerId: input.workerId, workerName: workerName, overrideType: input.overrideType, amount: input.amount, reason: input.reason } });
        return result;
      }),

    // ✅ جلب العمال الذين لديهم حضور فعلي في تاريخ معيّن ضمن مجموعة (لأداة التعبئة الجماعية)
    workersWithAttendance: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        date: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getWorkersWithAttendanceOnDate(input.groupId, input.date);
      }),

    // ✅ التعبئة الجماعية للاستثناءات: تُنشأ معتمدة فوراً، وتُحدَّث الدفعة المسودة القائمة تلقائياً إن وُجدت
    createBulk: protectedProcedure
      .input(z.object({
        overrideDate: z.string(),
        overrideType: z.enum(['bonus', 'deduction', 'advance', 'emergency_call']),
        reason: z.string().optional(),
        notes: z.string().optional(), // ملاحظة مشتركة اختيارية (تُستخدم إذا لم تُحدَّد ملاحظة مستقلة لعامل)
        entries: z.array(z.object({
          workerId: z.number(),
          amount: z.number().positive(),
          notes: z.string().optional(),
        })).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");

        const created: number[] = [];
        const blocked: { workerId: number; workerName: string; batchCode: string; batchStatus: string }[] = [];
        let updatedBatches = 0;

        for (const entry of input.entries) {
          const worker = await db.getWorkerById(entry.workerId);
          const existingBatch = await db.checkPayrollBatchForDate(input.overrideDate, worker?.groupId ?? undefined);

          // ✅ القاعدة الجديدة: يُسمح فقط إذا كانت الدفعة (إن وُجدت) بحالة "مسودة"
          if (existingBatch && existingBatch.status !== 'draft') {
            blocked.push({
              workerId: entry.workerId,
              workerName: worker?.fullName || `عامل رقم ${entry.workerId}`,
              batchCode: existingBatch.batchCode,
              batchStatus: existingBatch.status || '',
            });
            continue;
          }

          const result = await db.createPayOverrideDirect({
            workerId: entry.workerId,
            overrideDate: input.overrideDate,
            overrideType: input.overrideType,
            amount: entry.amount,
            reason: input.reason,
            notes: entry.notes ?? input.notes,
            createdBy: ctx.user.id,
          });
          created.push(result.id);

          // ✅ إذا كانت هناك مسودة قائمة فعلاً، حدّث بندها فوراً من مصدر البيانات الحقيقي
          if (existingBatch && existingBatch.status === 'draft') {
            const sync = await db.syncOverrideToDraftBatch(entry.workerId, input.overrideDate, worker?.groupId ?? undefined);
            if (sync) updatedBatches++;
          }
        }

        await db.logAudit({
          userId: ctx.user.id,
          action: 'CREATE_PAY_OVERRIDE_BULK',
          tableName: 'pay_overrides',
          newValues: {
            overrideDate: input.overrideDate,
            overrideType: input.overrideType,
            createdCount: created.length,
            blockedCount: blocked.length,
            updatedBatches,
          },
        });

        return {
          createdCount: created.length,
          updatedBatches,
          blocked,
        };
      }),

    // ✅ أرشيف الاستثناءات — مرئي فقط لأدوار: شؤون إدارية، سوبر أدمن، محاسب مالي، مراجع مالي، مدير مالي
    archive: protectedProcedure
      .use(requireRole('super_admin', 'admin_affairs', 'accountant', 'auditor', 'finance_manager'))
      .input(z.object({ groupId: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getOverridesArchive({ groupId: input.groupId });
      }),

    // ✅ تعديل استثناء من الأرشيف — شؤون إدارية وسوبر أدمن فقط
    update: protectedProcedure
      .use(requireRole('super_admin', 'admin_affairs'))
      .input(z.object({
        overrideId: z.number(),
        overrideDate: z.string(),
        overrideType: z.enum(['bonus', 'deduction', 'advance', 'emergency_call']),
        amount: z.number().positive(),
        notes: z.string().optional(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const result = await db.updateOverride(input);
        await db.logAudit({ userId: ctx.user.id, action: 'UPDATE_PAY_OVERRIDE', tableName: 'pay_overrides', recordId: input.overrideId, newValues: input });
        return result;
      }),

    // ✅ حذف استثناء من الأرشيف — شؤون إدارية وسوبر أدمن فقط
    delete: protectedProcedure
      .use(requireRole('super_admin', 'admin_affairs'))
      .input(z.object({ overrideId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const result = await db.deleteOverride(input.overrideId);
        await db.logAudit({ userId: ctx.user.id, action: 'DELETE_PAY_OVERRIDE', tableName: 'pay_overrides', recordId: input.overrideId });
        return result;
      }),
    
    // Get pending overrides
    pending: protectedProcedure
      .input(z.object({ groupId: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getPendingOverrides(input.groupId);
      }),
    
    // Approve override
    approve: protectedProcedure
      .input(z.object({ overrideId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const approveResult = await db.approveOverride(input.overrideId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'APPROVE_PAY_OVERRIDE', tableName: 'pay_overrides', recordId: input.overrideId });
        return approveResult;
      }),
    
    // Reject override
    reject: protectedProcedure
      .input(z.object({ overrideId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const rejectResult = await db.rejectOverride(input.overrideId, ctx.user.id);
        await db.logAudit({ userId: ctx.user.id, action: 'REJECT_PAY_OVERRIDE', tableName: 'pay_overrides', recordId: input.overrideId });
        return rejectResult;
      }),
});
