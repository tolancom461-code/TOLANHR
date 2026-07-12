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

  // ============================================
  // Operational Dashboard (العمليات التشغيلية)
  // ============================================
export const operationalDashboardRouter = router({
    // Get stats (present, absent, late counts)
    getStats: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        return await db.getOperationalDashboardStats(input.workDateStr, input.groupId, input.costCenterId);
      }),

    // Get present workers
    getPresentWorkers: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        const workers = await db.getPresentWorkers(input.workDateStr, input.groupId, input.costCenterId);
        return workers;
      }),

    // Get absent workers
    getAbsentWorkers: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        const workers = await db.getAbsentWorkersWithDetails(input.workDateStr, input.groupId, input.costCenterId);
        return workers;
      }),

    // Get late workers
    getLateWorkers: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        const workers = await db.getLateWorkers(input.workDateStr, input.groupId, input.costCenterId);
        return workers;
      }),

    // Create operational flag (supervisor action)
    createFlag: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
        flagDate: z.string(),
        flagType: z.enum(['confirm_attendance', 'confirm_absence', 'transfer']),
        description: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        
        // Get worker name for audit log
        const worker = await db.getWorkerById(input.workerId);
        const workerName = worker?.fullName || `عامل رقم ${input.workerId}`;
        
        const flagId = await db.createOperationalFlagFromAction({
          ...input,
          createdBy: ctx.user.id,
        });
        
        await db.logAudit({ 
          userId: ctx.user.id, 
          action: 'CREATE_FLAG', 
          tableName: 'operational_flags', 
          recordId: flagId, 
          newValues: { 
            workerId: input.workerId, 
            workerName: workerName,
            flagType: input.flagType, 
            description: input.description 
          } 
        });
        
        return { success: true, flagId };
      }),
    // Get flags for review pagee
    getFlags: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        flagType: z.string().optional(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getOperationalFlagsForReview(input);
      }),

    // Approve flag
    approveFlag: protectedProcedure
      .input(z.object({
        flagId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        // المشرفون لا يستطيعون معالجة الملاحظات
        if (ctx.user.role === 'supervisor_tolan' || ctx.user.role === 'supervisor_malqa') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'المشرفون لا يملكون صلاحية معالجة الملاحظات' });
        }
         const approveFlagResult = await db.approveOperationalFlag(input.flagId, ctx.user.id, input.notes);
        await db.logAudit({ userId: ctx.user.id, action: 'APPROVE_FLAG', tableName: 'operational_flags', recordId: input.flagId, newValues: { notes: input.notes } });
        return approveFlagResult;
      }),
    // Reject flag
    rejectFlag: protectedProcedure
      .input(z.object({
        flagId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        // المشرفون لا يستطيعون معالجة الملاحظات
        if (ctx.user.role === 'supervisor_tolan' || ctx.user.role === 'supervisor_malqa') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'المشرفون لا يملكون صلاحية معالجة الملاحظات' });
        }
        const rejectFlagResult = await db.rejectOperationalFlag(input.flagId, ctx.user.id, input.notes);
        await db.logAudit({ userId: ctx.user.id, action: 'REJECT_FLAG', tableName: 'operational_flags', recordId: input.flagId, newValues: { notes: input.notes } });
        return rejectFlagResult;
      }),

    // Get pending count
    getPendingCount: protectedProcedure
      .query(async () => {
        return await db.getPendingOperationalFlagsCount();
      }),

    // Generate auto flags for unconfirmed present workers
    generateUnconfirmedFlags: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        // جلب العمال الحاضرين
        const presentWorkers = await db.getPresentWorkers(input.workDateStr, input.groupId, input.costCenterId);
        // جلب البلاغات الموجودة لهذا التاريخ
        const existingFlags = await db.getOperationalFlagsForReview({
          startDate: input.workDateStr,
          endDate: input.workDateStr,
        });
        // تحديد العمال الذين لديهم تأكيد حضور
        const confirmedWorkerIds = new Set(
          (existingFlags || []).filter((f: any) => f.flagType === 'confirm_attendance').map((f: any) => f.workerId)
        );
        // إنشاء بلاغات للعمال غير المؤكدين
        let createdCount = 0;
        for (const worker of (presentWorkers || [])) {
          if (!confirmedWorkerIds.has(worker.workerId)) {
            await db.createOperationalFlagFromAction({
              workerId: worker.workerId,
              groupId: worker.groupId,
              costCenterId: worker.costCenterId,
              flagDate: input.workDateStr,
              flagType: 'other',
              description: `حضور غير مؤكد من المشرف - العامل ${worker.workerName} (${worker.workerCode || ''}) سُجّل حاضراً بتاريخ ${input.workDateStr} لكن لم يتم تأكيد حضوره من المشرف`,
              createdBy: ctx.user.id,
            });
            createdCount++;
          }
        }
        if (createdCount > 0) {
          await db.logAudit({ userId: ctx.user.id, action: 'GENERATE_UNCONFIRMED_FLAGS', tableName: 'operational_flags', recordId: 0, newValues: { date: input.workDateStr, count: createdCount } });
        }
        return { success: true, createdCount };
      }),

    // Get confirmed worker IDs for a specific date
    getConfirmedWorkerIds: protectedProcedure
      .input(z.object({
        workDateStr: z.string(),
      }))
      .query(async ({ input }) => {
        const flags = await db.getOperationalFlagsForReview({
          startDate: input.workDateStr,
          endDate: input.workDateStr,
        });
        const confirmedIds = (flags || []).filter((f: any) => f.flagType === 'confirm_attendance').map((f: any) => f.workerId);
        return confirmedIds;
      }),

    // تقرير متابعة أداء المشرفين في تأكيد الحضور
    getSupervisorPerformance: protectedProcedure
      .input(z.object({
        fromDate: z.string(),
        toDate: z.string(),
      }))
      .use(requireRole('super_admin', 'finance_manager', 'executive', 'admin_affairs'))
      .query(async ({ input }) => {
        const { fromDate, toDate } = input;
        console.log('[getSupervisorPerformance] Input:', { fromDate, toDate });
        
        // جلب جميع المشرفين
        const allUsers = await db.getAllUsers();
        const supervisors = allUsers.filter((u: any) => 
          (u.role === 'supervisor_tolan' || u.role === 'supervisor_malqa') && u.isActive
        );
        console.log('[getSupervisorPerformance] Found supervisors:', supervisors.length);
        
        // جلب جميع المجموعات
        const allGroups = await db.getAllGroups();
        console.log('[getSupervisorPerformance] Found groups:', allGroups.length);
        
        // جلب جميع البلاغات في الفترة
        const allFlags = await db.getOperationalFlagsForReview({
          startDate: fromDate,
          endDate: toDate,
        });
        
        // إنشاء قائمة التواريخ
        const dates: string[] = [];
        const start = new Date(fromDate);
        const end = new Date(toDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }
        
        const results: any[] = [];
        
        for (const date of dates) {
          for (const supervisor of supervisors) {
            // جلب المجموعات المعينة لهذا المشرف
            const supervisorGroups = allGroups.filter((g: any) => g.supervisorId === supervisor.id);
            if (supervisorGroups.length === 0) continue;
            
            const groupNames = supervisorGroups.map((g: any) => g.name).join('\u060C ');
            const groupIds = supervisorGroups.map((g: any) => g.id);
            
            // حساب العمال الحاضرين في مجموعات هذا المشرف
            const presentWorkers = await db.getPresentWorkers(date);
            if (date === dates[0] && supervisor.id === supervisors[0]?.id) {
              console.log(`[getSupervisorPerformance] Date ${date}, Supervisor ${supervisor.fullName}: presentWorkers =`, presentWorkers?.length || 0);
            }
            const supervisorPresent = (presentWorkers || []).filter((w: any) => groupIds.includes(w.groupId));
            const totalPresent = supervisorPresent.length;
            
            if (totalPresent === 0) continue; // تجاهل الأيام بدون حاضرين
            
            // حساب البلاغات التي أنشأها هذا المشرف
            const supervisorFlags = (allFlags || []).filter((f: any) => 
              f.createdBy === supervisor.id && 
              f.flagDate && new Date(f.flagDate).toISOString().split('T')[0] === date
            );
            const confirmedCount = supervisorFlags.filter((f: any) => f.flagType === 'confirm_attendance').length;
            const absenceCount = supervisorFlags.filter((f: any) => f.flagType === 'confirm_absence').length;
            const transferCount = supervisorFlags.filter((f: any) => f.flagType === 'transfer').length;
            const totalActions = confirmedCount + absenceCount + transferCount;
            const unconfirmedCount = Math.max(0, totalPresent - confirmedCount);
            const shortfallPercent = totalPresent > 0 ? Math.round((unconfirmedCount / totalPresent) * 100) : 0;
            
            results.push({
              date,
              supervisorId: supervisor.id,
              supervisorName: supervisor.fullName,
              supervisorRole: supervisor.role === 'supervisor_tolan' ? 'مشرف تولان' : 'مشرف الملقا',
              groupNames,
              totalPresent,
              confirmedCount,
              absenceCount,
              transferCount,
              totalActions,
              unconfirmedCount,
              shortfallPercent,
            });
          }
        }
        
        // ترتيب حسب التاريخ (الأحدث أولاً) ثم حسب نسبة التقصير (الأعلى أولاً)
        results.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.shortfallPercent - a.shortfallPercent;
        });
        
        console.log('[getSupervisorPerformance] Returning results:', results.length);
        return results;
      }),
});
