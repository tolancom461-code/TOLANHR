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

  // Daily Finance (Attendance to Finance)
export const dailyFinanceRouter = router({
    // Process attendance to create daily finance record
    processAttendance: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDate: z.string(),
      }))
      .use(requireRole('super_admin', 'admin_affairs', 'accountant'))
      .mutation(async ({ input }) => {
        return await db.processAttendanceToFinance(input.workerId, input.workDate);
      }),
    
    // Get daily finance records for a worker
    getRecords: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getDailyFinanceRecords(input.workerId, input.startDate, input.endDate);
      }),
    
    // Add finance entry (deduction, bonus, fine, addition)
    addEntry: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDate: z.string(),
        entryType: z.enum(['deduction', 'bonus', 'fine', 'addition']),
        amount: z.number().positive(),
        reason: z.string().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs', 'accountant'))
      .mutation(async ({ input }) => {
        // Check if payroll batch exists for this date
        const batch = await db.checkPayrollBatchForDate(input.workDate);
        if (batch) {
          throw new Error(`لا يمكن إضافة خصومات أو إضافات بعد إنشاء دفعة العمال. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
        }
        
        return await db.addFinanceEntry(
          input.workerId,
          input.workDate,
          input.entryType,
          input.amount,
          input.reason
        );
      }),
    
    // Update daily finance manually
    update: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDate: z.string(),
        baseAmount: z.number().optional(),
        deductions: z.number().optional(),
        bonuses: z.number().optional(),
        lateMinutes: z.number().optional(),
        earlyLeaveMinutes: z.number().optional(),
        notes: z.string().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs', 'accountant'))
      .mutation(async ({ input }) => {
        return await db.createOrUpdateDailyFinance(input.workerId, input.workDate, {
          baseAmount: input.baseAmount,
          deductions: input.deductions,
          bonuses: input.bonuses,
          lateMinutes: input.lateMinutes,
          earlyLeaveMinutes: input.earlyLeaveMinutes,
          notes: input.notes,
        });
      }),
    
    // Set full day override
    setFullDayOverride: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDate: z.string(),
        override: z.boolean(),
        reason: z.string().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs', 'accountant'))
      .mutation(async ({ input, ctx }) => {
        // Check is already done in db.setFullDayOverride
        // No need to duplicate here
        const overrideResult = await db.setFullDayOverride(
          input.workerId,
          input.workDate,
          input.override,
          input.reason,
          ctx.user?.id
        );
        // Get worker name for audit log
        const worker = await db.getWorkerById(input.workerId);
        const workerName = worker?.fullName || `عامل رقم ${input.workerId}`;
        
        await db.logAudit({ userId: ctx.user?.id, action: 'SET_FULL_DAY_OVERRIDE', tableName: 'attendance_events', newValues: { workerId: input.workerId, workerName: workerName, workDate: input.workDate, override: input.override, reason: input.reason } });
        return overrideResult;
      }),

});
