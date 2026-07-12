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
export const backupRouter = router({
    // Get table info for backup
    getTableInfo: protectedProcedure
      .use(requireRole('super_admin', 'finance_manager'))
      .query(async () => {
        return await db.getBackupTableInfo();
      }),

    // Export selected tables as Excel
    exportExcel: protectedProcedure
      .input(z.object({
        tableNames: z.array(z.string()),
      }))
      .use(requireRole('super_admin', 'finance_manager'))
      .mutation(async ({ input, ctx }) => {
        const data = await db.exportTablesData(input.tableNames);
        
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Tolan Workforce';
        workbook.created = new Date();
        
        const arabicLabels: Record<string, string> = {
          users: 'المستخدمين', workers: 'العمال', groups: 'المجموعات',
          cost_centers: 'مراكز التكلفة', attendance_events: 'سجل الحضور',
          payroll_batches: 'دفعات الرواتب', payroll_batch_items: 'عناصر الرواتب',
          operational_flags: 'البلاغات التشغيلية', temporary_assignments: 'الانتدابات المؤقتة',
          audit_log: 'سجل التدقيق', pay_overrides: 'التجاوزات المالية',
          group_schedules: 'جداول المجموعات', worker_daily_finance: 'المالية اليومية',
          payroll_batch_notes: 'ملاحظات الرواتب', payroll_batch_corrections: 'تصحيحات الرواتب',
          work_days: 'أيام العمل', deduction_rules: 'قواعد الخصم',
          user_cost_centers: 'مراكز تكلفة المستخدمين',
        };
        
        for (const [tableName, rows] of Object.entries(data)) {
          if (!rows || rows.length === 0) continue;
          const sheetName = arabicLabels[tableName] || tableName;
          const sheet = workbook.addWorksheet(sheetName);
          
          const columns = Object.keys(rows[0]);
          sheet.columns = columns.map(col => ({
            header: col,
            key: col,
            width: 20,
          }));
          
          sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' },
          };
          sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          
          for (const row of rows) {
            const rowData: Record<string, any> = {};
            for (const col of columns) {
              const val = (row as any)[col];
              rowData[col] = val instanceof Date ? val.toISOString() : val;
            }
            sheet.addRow(rowData);
          }
        }
        
        const buffer = await workbook.xlsx.writeBuffer();
        const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');
        
        await db.logAudit({
          userId: ctx.user.id,
          action: 'نسخ احتياطي Excel',
          tableName: 'backup',
          newValues: { type: 'excel', tables: input.tableNames, timestamp: new Date().toISOString() },
        });
        
        return { base64, filename: `tolan_backup_${new Date().toISOString().slice(0,10)}.xlsx` };
      }),

    // Export full SQL dump
    exportSql: protectedProcedure
      .use(requireRole('super_admin', 'finance_manager'))
      .mutation(async ({ ctx }) => {
        
        const sqlDump = await db.exportFullSqlDump();
        const base64 = Buffer.from(sqlDump, 'utf-8').toString('base64');
        
        await db.logAudit({
          userId: ctx.user.id,
          action: 'نسخ احتياطي SQL',
          tableName: 'backup',
          newValues: { type: 'sql', timestamp: new Date().toISOString() },
        });
        
        return { base64, filename: `tolan_backup_${new Date().toISOString().slice(0,10)}.sql` };
      }),

    // Export selected table as CSV
    exportCsv: protectedProcedure
      .input(z.object({
        tableName: z.string(),
      }))
      .use(requireRole('super_admin', 'finance_manager'))
      .mutation(async ({ input, ctx }) => {
        const data = await db.exportTablesData([input.tableName]);
        const rows = data[input.tableName] || [];
        
        if (rows.length === 0) return { base64: '', filename: '' };
        
        const columns = Object.keys(rows[0]);
        let csv = columns.join(',') + '\n';
        for (const row of rows) {
          const values = columns.map(col => {
            const val = (row as any)[col];
            if (val === null || val === undefined) return '';
            const str = val instanceof Date ? val.toISOString() : String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          });
          csv += values.join(',') + '\n';
        }
        
        const base64 = Buffer.from(csv, 'utf-8').toString('base64');
        
        await db.logAudit({
          userId: ctx.user.id,
          action: 'نسخ احتياطي CSV',
          tableName: 'backup',
          newValues: { type: 'csv', table: input.tableName, timestamp: new Date().toISOString() },
        });
        
        return { base64, filename: `${input.tableName}_${new Date().toISOString().slice(0,10)}.csv` };
      }),

    // Get backup history
    getHistory: protectedProcedure
      .use(requireRole('super_admin', 'finance_manager'))
      .query(async () => {
        return await db.getBackupHistory();
      }),
});
