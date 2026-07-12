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

  // Daily Payroll Report
export const dailyPayrollReportRouter = router({
    getReport: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterId: z.number().optional(),
        groupIds: z.array(z.number()).optional(),
      }))
      .query(async ({ input }) => {
        const { getDailyPayrollReport } = await import('../dailyPayrollReport');
        return await getDailyPayrollReport(
          input.periodStart,
          input.periodEnd,
          input.costCenterId ?? undefined,
          input.groupIds
        );
      }),

    getGroups: protectedProcedure
      .input(z.object({
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const { getDailyPayrollGroups } = await import('../dailyPayrollReport');
        return await getDailyPayrollGroups(input.costCenterId);
      }),
});
