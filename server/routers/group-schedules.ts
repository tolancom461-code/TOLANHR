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

  // Group Schedules Router
export const groupSchedulesRouter = router({
    listByGroup: protectedProcedure
      .input(z.object({
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const schedules = await db.getGroupSchedules(input.groupId);
          return schedules;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch group schedules',
            cause: error,
          });
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        requiredHours: z.number().optional(),
        effectiveDate: z.string().optional(),
      }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input, ctx }) => {
        try {
          const updated = await db.updateGroupSchedule(
            input.id,
            input.startTime,
            input.endTime,
            input.requiredHours,
            input.effectiveDate
          );
          await db.logAudit({ userId: ctx.user?.id, action: 'UPDATE_GROUP_SCHEDULE', tableName: 'groups', recordId: input.id, newValues: { startTime: input.startTime, endTime: input.endTime, requiredHours: input.requiredHours, effectiveDate: input.effectiveDate } });
          return updated;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update group schedule',
            cause: error,
          });
        }
      }),

    saveWeeklySchedules: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        schedules: z.array(z.object({
          dayOfWeek: z.number().min(0).max(6),
          startTime: z.string(),
          endTime: z.string(),
          requiredHours: z.number(),
          isActive: z.boolean(),
          dailyRate: z.string().optional(), // ✅ المبلغ اليومي المخصص (اختياري)
        })),
        effectiveDate: z.string().optional(),
      }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input, ctx }) => {
        try {
          const result = await db.saveWeeklySchedules(
            input.groupId,
            input.schedules,
            input.effectiveDate
          );
          await db.logAudit({ userId: ctx.user?.id, action: 'UPDATE_WEEKLY_SCHEDULES', tableName: 'groups', recordId: input.groupId, newValues: { schedulesCount: input.schedules.length, effectiveDate: input.effectiveDate } });
          return result;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to save weekly schedules',
            cause: error,
          });
        }
      }),

    checkDateConflict: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        effectiveDate: z.string(),
      }))
      .query(async ({ input }) => {
        try {
          const conflict = await db.checkScheduleDateConflict(
            input.groupId,
            input.effectiveDate
          );
          return conflict;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to check date conflict',
            cause: error,
          });
        }
      }),

    getEarliestSafeDate: protectedProcedure
      .input(z.object({
        groupId: z.number(),
      }))
      .query(async ({ input }) => {
        try {
          const safeDate = await db.getEarliestSafeEffectiveDate(input.groupId);
          return { safeDate };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get earliest safe date',
            cause: error,
          });
        }
      }),

    getRecentChanges: protectedProcedure
      .input(z.object({
        hoursThreshold: z.number().optional().default(24),
      }))
      .query(async ({ input }) => {
        try {
          const changes = await db.getRecentScheduleChanges(input.hoursThreshold);
          return changes;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get recent schedule changes',
            cause: error,
          });
        }
      }),
});
