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

  // TEMPORARY: Migration endpoint for flexible schedule feature
export const migrationRouter = router({
    addFlexibleScheduleColumns: protectedProcedure
      .use(requireRole('super_admin'))
      .mutation(async ({ ctx }) => {
        try {
          await db.runMigration();
          
          await db.logAudit({
            userId: ctx.user.id,
            action: 'تشغيل Migration',
            tableName: 'groups',
            newValues: { migration: 'add_flexible_schedule_columns', timestamp: new Date().toISOString() },
          });
          
          return { success: true, message: 'Migration completed successfully' };
        } catch (error: any) {
          if (error.message?.includes('duplicate column name')) {
            return { success: true, message: 'Columns already exist, migration not needed' };
          }
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Migration failed: ${error.message}`,
          });
        }
      }),
});
