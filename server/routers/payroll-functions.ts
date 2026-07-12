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
  // Payroll Advanced Functions
  // ============================================
export const payrollFunctionsRouter = router({
    // Calculate daily payroll for a worker
    calculateDailyPayroll: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDateStr: z.string(), // YYYY-MM-DD format
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will call the database function when implemented
          // For now, return a placeholder response
          return {
            workerId: input.workerId,
            workDate: workDate,
            scheduledHours: 8,
            actualHours: 8,
            lateMinutes: 0,
            earlyDepartureMinutes: 0,
            dailyRate: 500,
            calculatedPay: 500,
            isAutoCompleted: false,
            status: 'COMPLETED',
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to calculate daily payroll',
            cause: error,
          });
        }
      }),

    // Calculate group payroll summary
    calculateGroupPayroll: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        workDateStr: z.string(), // YYYY-MM-DD format
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will call the database function when implemented
          // For now, return a placeholder response
          return {
            groupId: input.groupId,
            workDate: workDate,
            totalEmployees: 5,
            employeesWithIssues: 0,
            totalHoursWorked: 40,
            totalScheduledHours: 40,
            totalPayroll: 2500,
            averageDailyPay: 500,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to calculate group payroll',
            cause: error,
          });
        }
      }),

    // Detect missing punches
    detectMissingPunches: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDateStr: z.string(), // YYYY-MM-DD format
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will call the database function when implemented
          // For now, return a placeholder response
          return {
            workerId: input.workerId,
            workDate: workDate,
            hasCheckIn: true,
            hasCheckOut: true,
            issueType: 'COMPLETE',
            needsReview: false,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to detect missing punches',
            cause: error,
          });
        }
      }),

    // Get daily payroll summary for all workers
    getDailyPayrollSummary: protectedProcedure
      .input(z.object({
        workDateStr: z.string(), // YYYY-MM-DD format
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will query the vw_daily_payroll_summary view
          // For now, return a placeholder response
          return {
            date: workDate,
            groupId: input.groupId,
            summary: [],
            totalRecords: 0,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get daily payroll summary',
            cause: error,
          });
        }
      }),

    // Get group payroll summary for all groups
    getGroupPayrollSummary: protectedProcedure
      .input(z.object({
        workDateStr: z.string(), // YYYY-MM-DD format
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will query the vw_group_payroll_summary view
          // For now, return a placeholder response
          return {
            date: workDate,
            summary: [],
            totalGroups: 0,
            totalEmployees: 0,
            totalPayroll: 0,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get group payroll summary',
            cause: error,
          });
        }
      }),

    // Get workers with missing punches for a date
    getWorkersWithMissingPunches: protectedProcedure
      .input(z.object({
        workDateStr: z.string(), // YYYY-MM-DD format
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const workDate = new Date(`${input.workDateStr}T00:00:00`);
          // Note: This will detect missing punches for all workers
          // For now, return a placeholder response
          return {
            date: workDate,
            groupId: input.groupId,
            workers: [],
            totalCount: 0,
          };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get workers with missing punches',
            cause: error,
          });
        }
      }),
});
