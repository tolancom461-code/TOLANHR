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

  // Financial Reports
export const financialReportsRouter = router({
    // Get worker financial report
    worker: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getWorkerFinancialReport(
          input.workerId,
          new Date(input.startDate),
          new Date(input.endDate)
        );
      }),
    
    // Get group financial report
    group: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getGroupFinancialReport(
          input.groupId,
          new Date(input.startDate),
          new Date(input.endDate)
        );
      }),
    
    // Get cost center financial report
    costCenter: protectedProcedure
      .input(z.object({
        costCenterId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getCostCenterFinancialReport(
          input.costCenterId,
          new Date(input.startDate),
          new Date(input.endDate)
        );
      }),
    
    // Get all financial reports summary
    summary: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getAllFinancialReportsSummary(
          new Date(input.startDate),
          new Date(input.endDate)
        );
      }),
});
