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

  // Audit Log (سجل التدقيق)
export const auditRouter = router({
    // Get comprehensive audit log entries - restricted to auditor, finance_manager, super_admin
    getLog: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        action: z.string().optional(),
        tableName: z.string().optional(),
        userId: z.number().optional(),
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }))
      .use(requireRole('auditor', 'finance_manager', 'super_admin'))
      .query(async ({ input }) => {
        return await db.getAuditLog(input);
      }),
    
    // Get audit log statistics
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .use(requireRole('auditor', 'finance_manager', 'super_admin'))
      .query(async ({ input }) => {
        return await db.getAuditLogStats(input);
      }),
    
    // Get list of users for filter dropdown
    getUsers: protectedProcedure
      .use(requireRole('auditor', 'finance_manager', 'super_admin'))
      .query(async () => {
        const allUsers = await db.getAllUsers();
        return allUsers.map(u => ({ id: u.id, fullName: u.fullName, role: u.role }));
      }),
});
