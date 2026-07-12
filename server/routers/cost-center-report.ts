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
  // Backup - النسخ الاحتياطي
  // ============================================
  // تقرير مستحقات العمالة التشغيلية حسب مركز التكلفة
  // ============================================
export const costCenterReportRouter = router({
    getData: protectedProcedure
      .input(z.object({
        periodStart: z.string(),
        periodEnd: z.string(),
        costCenterId: z.number().optional(),
      }))
      .use(requireRole('super_admin', 'finance_manager', 'executive'))
      .query(async ({ ctx, input }) => {
        return await db.getCostCenterPayrollReport(input.periodStart, input.periodEnd, input.costCenterId);
      }),
});
