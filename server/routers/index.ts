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
import { authRouter } from './auth';
import { dashboardRouter } from './dashboard';
import { notificationsRouter } from './notifications';
import { analyticsRouter } from './analytics';
import { usersRouter } from './users';
import { restaurantsRouter } from './restaurants';
import { groupsRouter } from './groups';
import { workersRouter } from './workers';
import { costCentersRouter } from './cost-centers';
import { profileRouter } from './profile';
import { attendanceRouter } from './attendance';
import { workDaysRouter } from './work-days';
import { dailyFinanceRouter } from './daily-finance';
import { attendanceAdjustRouter } from './attendance-adjust';
import { payOverridesRouter } from './pay-overrides';
import { exportRouter } from './export';
import { financialReportsRouter } from './financial-reports';
import { payrollRouter } from './payroll';
import { deductionsRouter } from './deductions';
import { attendanceStatusRouter } from './attendance-status';
import { operationalFlagsRouter } from './operational-flags';
import { payrollFunctionsRouter } from './payroll-functions';
import { groupSchedulesRouter } from './group-schedules';
import { excelImportExportRouter } from './excel-import-export';
import { auditRouter } from './audit';
import { temporaryAssignmentsRouter } from './temporary-assignments';
import { executiveRouter } from './executive';
import { operationalDashboardRouter } from './operational-dashboard';
import { costCenterReportRouter } from './cost-center-report';
import { backupRouter } from './backup';
import { migrationRouter } from './migration';
import { financialRecalculationRouter } from './financial-recalculation';
import { dailyPayrollReportRouter } from './daily-payroll-report';
import { ceoReportsRouter } from './ceo-reports';
import { dailyAttendanceReportsRouter } from './daily-attendance-reports';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const appRouter = router({
  system: systemRouter,

  auth: authRouter,

  // Dashboard Statistics
  dashboard: dashboardRouter,

  notifications: notificationsRouter,

  // AI-Powered Analytics
  analytics: analyticsRouter,

  // User Management
  users: usersRouter,

  // Role Management
  // NOTE: roles and permissions routers have been removed.
  // All users are now treated as Admin with full access.
  // Restaurants Management (ميزة التشغيل وتكاليف المطاعم)
  restaurants: restaurantsRouter,

  // Groups Management
  groups: groupsRouter,

  // Workers Management
  workers: workersRouter,

  // Cost Centers
  costCenters: costCentersRouter,

  // Profile Management
  profile: profileRouter,

  // Attendance System (Phase 4)
  attendance: attendanceRouter,

  // Work Days Management
  workDays: workDaysRouter,

  // Daily Finance (Attendance to Finance)
  dailyFinance: dailyFinanceRouter,

  // Attendance Adjustment (HR)
  attendanceAdjust: attendanceAdjustRouter,

  // Pay Overrides (Exceptions)
  payOverrides: payOverridesRouter,

  // Excel Export
  export: exportRouter,

  // Financial Reports
  financialReports: financialReportsRouter,

  // Payroll Batches
  payroll: payrollRouter,
  deductions: deductionsRouter,

  // Operational Flags
  // Attendance Status Types
  attendanceStatus: attendanceStatusRouter,

  operationalFlags: operationalFlagsRouter,

  // ============================================
  // Payroll Advanced Functions
  // ============================================
  payrollFunctions: payrollFunctionsRouter,

  // Group Schedules Router
  groupSchedules: groupSchedulesRouter,

  // Excel Import/Export Router
  excelImportExport: excelImportExportRouter,

  // Audit Log (سجل التدقيق)
  audit: auditRouter,

  // ============================================
  // Temporary Assignments (الانتدابات المؤقتة)
  // ============================================
  temporaryAssignments: temporaryAssignmentsRouter,

  // ============================================
  // Executive Dashboard (لوحة الإدارة العليا)
  // ============================================
  executive: executiveRouter,

  // ============================================
  // Operational Dashboard (العمليات التشغيلية)
  // ============================================
  operationalDashboard: operationalDashboardRouter,

  // ============================================
  // Backup - النسخ الاحتياطي
  // ============================================
  // تقرير مستحقات العمالة التشغيلية حسب مركز التكلفة
  // ============================================
  costCenterReport: costCenterReportRouter,

  // ============================================
  backup: backupRouter,

  // TEMPORARY: Migration endpoint for flexible schedule feature
  migration: migrationRouter,

  // Financial Recalculation (Global Recalculator)
  financialRecalculation: financialRecalculationRouter,

  // Database console for debugging
  dbQuery: adminProcedure
    .input(z.object({ query: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const connection = await db.getRawConnection();
        if (!connection) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database connection not available',
          });
        }
        
        // Execute raw SQL query using mysql2 directly
        const [rows, fields] = await connection.query(input.query);
        
        // Return results with proper structure
        return { 
          rows: Array.isArray(rows) ? rows : [], 
          affectedRows: (rows as any).affectedRows || 0 
        };
      } catch (error: any) {
        console.error('Database query error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Query execution failed',
        });
      }
    }),

  // Daily Payroll Report
  dailyPayrollReport: dailyPayrollReportRouter,
  ceoReports: ceoReportsRouter,
  dailyAttendanceReports: dailyAttendanceReportsRouter,
});

export type AppRouter = typeof appRouter;
