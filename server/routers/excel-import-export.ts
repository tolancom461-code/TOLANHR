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

  // Excel Import/Export Router
export const excelImportExportRouter = router({
    // Download templates
    downloadGroupsTemplate: protectedProcedure
      .query(async () => {
        try {
          const buffer = await generateGroupsExcelTemplate();
          return {
            success: true,
            data: buffer.toString('base64'),
            filename: 'groups_template.xlsx',
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل تحميل قالب المجموعات',
            cause: error,
          });
        }
      }),

    downloadWorkersTemplate: protectedProcedure
      .query(async () => {
        try {
          const buffer = await generateWorkersExcelTemplate();
          return {
            success: true,
            data: buffer.toString('base64'),
            filename: 'workers_template.xlsx',
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل تحميل قالب العمال',
            cause: error,
          });
        }
      }),

    // Import from Excel
    importGroups: protectedProcedure
      .input(z.object({
        fileData: z.string(), // base64 encoded
      }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.fileData, 'base64');
          const { data, errors } = await parseGroupsFromExcel(buffer);

          if (errors.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `خطأ في البيانات: ${errors.map(e => `صف ${e.row}: ${e.message}`).join(', ')}`,
            });
          }

          // Insert groups
          const results = [];
          for (const group of data) {
            try {
              const id = await db.createGroup(group as any);
              results.push({ success: true, id, name: group.name });
            } catch (error: any) {
              results.push({ success: false, name: group.name, error: error.message });
            }
          }

          return {
            success: true,
            imported: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'فشل استيراد المجموعات',
            cause: error,
          });
        }
      }),

    importWorkers: protectedProcedure
      .input(z.object({
        fileData: z.string(), // base64 encoded
      }))
      .use(requirePermissionFlag('canManageWorkers'))
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.fileData, 'base64');
          const { data, errors } = await parseWorkersFromExcel(buffer);

          if (errors.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `خطأ في البيانات: ${errors.map(e => `صف ${e.row}: ${e.message}`).join(', ')}`,
            });
          }

          // Insert workers
          const results = [];
          for (const worker of data) {
            try {
              const id = await db.createWorkerFromImportData(worker);
              results.push({ success: true, id, name: worker.fullName });
            } catch (error: any) {
              results.push({ success: false, name: worker.fullName, error: error.message });
            }
          }

          return {
            success: true,
            imported: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'فشل استيراد العمال',
            cause: error,
          });
        }
      }),

    // Export to Excel
    exportGroups: protectedProcedure
      .query(async () => {
        try {
          const groups = await db.getAllGroups();
          const buffer = await generateGroupsExcelExport(groups);
          return {
            success: true,
            data: buffer.toString('base64'),
            filename: `groups_export_${new Date().toLocaleDateString('en-CA')}.xlsx`,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل تصدير المجموعات',
            cause: error,
          });
        }
      }),

    exportWorkers: protectedProcedure
      .query(async () => {
        try {
          const workers = await db.getAllWorkers();
          const buffer = await generateWorkersExcelExport(workers);
          return {
            success: true,
            data: buffer.toString('base64'),
            filename: `workers_export_${new Date().toLocaleDateString('en-CA')}.xlsx`,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل تصدير العمال',
            cause: error,
          });
        }
      }),
});
