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
