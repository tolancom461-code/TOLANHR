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

  // Excel Export
export const exportRouter = router({    // Export attendance report
    attendanceReport: protectedProcedure
      .input(z.object({
        month: z.string(),
        year: z.number(),
        groupId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Get attendance data
        const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const monthNumber = monthNames.indexOf(input.month) + 1;
        const data = await db.getMonthlyAttendanceReport(input.year, monthNumber, input.groupId);
        
        // Transform to Excel format
        const excelData: AttendanceReportRow[] = data.map(row => ({
          workerName: row.workerName,
          workerCode: row.workerCode,
          groupName: '', // Group name not in report
          daysWorked: row.daysPresent,
          daysLate: 0, // TODO: Add late tracking
          daysAbsent: 0, // TODO: Add absence tracking
          totalHours: row.totalHours,
          lateMinutes: 0, // TODO: Add late minutes tracking
        }));
        
        // Generate Excel buffer
        const buffer = await generateAttendanceExcel(excelData, input.month, input.year);
        
        // Return base64 encoded buffer
        return {
          data: buffer.toString('base64'),
          filename: `attendance_${input.month}_${input.year}.xlsx`,
        };
      }),
    
    // Export detailed attendance records
    detailedAttendance: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const data = await db.getAttendanceReportData(
          input.startDate,
          input.endDate,
          input.groupId,
          input.costCenterId
        );
        
        // Generate Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('تقرير الحضور والانصراف');
        
        // Add headers
        worksheet.columns = [
          { header: 'اسم العامل', key: 'workerName', width: 20 },
          { header: 'كود العامل', key: 'workerCode', width: 15 },
          { header: 'المجموعة', key: 'groupName', width: 15 },
          { header: 'مركز التكلفة', key: 'costCenterName', width: 15 },
          { header: 'النوع', key: 'eventType', width: 12 },
          { header: 'الوقت', key: 'eventTime', width: 20 },
          { header: 'الطريقة', key: 'method', width: 12 },
        ];
        
        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
        worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Add data rows
        data.forEach((row: any) => {
          worksheet.addRow({
            workerName: row.workerName,
            workerCode: row.workerCode,
            groupName: row.groupName,
            costCenterName: row.costCenterName,
            eventType: row.eventType === 'check_in' ? 'حضور' : 'انصراف',
            eventTime: new Date(row.eventTime).toLocaleString('ar-SA'),
            method: row.method || 'يدوي',
          });
        });
        
        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        return {
          data: Buffer.from(buffer as any).toString('base64'),
          filename: `detailed_attendance_${input.startDate}_to_${input.endDate}.xlsx`,
        };
      }),
    
    // Export attendance summary by worker
    summaryByWorker: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const data = await db.getAttendanceSummaryByWorker(
          input.startDate,
          input.endDate,
          input.groupId,
          input.costCenterId
        );
        
        // Generate Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('ملخص الحضور بالعامل');
        
        // Add headers
        worksheet.columns = [
          { header: 'اسم العامل', key: 'workerName', width: 20 },
          { header: 'كود العامل', key: 'workerCode', width: 15 },
          { header: 'المجموعة', key: 'groupName', width: 15 },
          { header: 'مركز التكلفة', key: 'costCenterName', width: 15 },
          { header: 'أيام الحضور', key: 'daysPresent', width: 12 },
          { header: 'عدد الحضور', key: 'totalCheckIns', width: 12 },
          { header: 'عدد الانصراف', key: 'totalCheckOuts', width: 12 },
          { header: 'إجمالي الساعات', key: 'totalHours', width: 15 },
          { header: 'متوسط الساعات/اليوم', key: 'avgHoursPerDay', width: 15 },
        ];
        
        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
        worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Add data rows
        data.forEach((row: any) => {
          worksheet.addRow({
            workerName: row.workerName,
            workerCode: row.workerCode,
            groupName: row.groupName,
            costCenterName: row.costCenterName,
            daysPresent: row.daysPresent,
            totalCheckIns: row.totalCheckIns,
            totalCheckOuts: row.totalCheckOuts,
            totalHours: row.totalHours,
            avgHoursPerDay: row.avgHoursPerDay,
          });
        });
        
        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        return {
          data: Buffer.from(buffer as any).toString('base64'),
          filename: `attendance_summary_by_worker_${input.startDate}_to_${input.endDate}.xlsx`,
        };
      }),
    
    // Export attendance summary by group
    summaryByGroup: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        costCenterId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const data = await db.getAttendanceSummaryByGroup(
          input.startDate,
          input.endDate,
          input.costCenterId
        );
        
        // Generate Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('ملخص الحضور بالمجموعة');
        
        // Add headers
        worksheet.columns = [
          { header: 'المجموعة', key: 'groupName', width: 20 },
          { header: 'مركز التكلفة', key: 'costCenterName', width: 15 },
          { header: 'عدد العمال', key: 'totalWorkers', width: 12 },
          { header: 'عدد الحضور', key: 'totalCheckIns', width: 12 },
          { header: 'عدد الانصراف', key: 'totalCheckOuts', width: 12 },
          { header: 'أيام الحضور', key: 'daysWithAttendance', width: 12 },
          { header: 'إجمالي الساعات', key: 'totalHours', width: 15 },
          { header: 'متوسط الساعات/اليوم', key: 'avgHoursPerDay', width: 15 },
        ];
        
        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
        worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Add data rows
        data.forEach((row: any) => {
          worksheet.addRow({
            groupName: row.groupName,
            costCenterName: row.costCenterName,
            totalWorkers: row.totalWorkers,
            totalCheckIns: row.totalCheckIns,
            totalCheckOuts: row.totalCheckOuts,
            daysWithAttendance: row.daysWithAttendance,
            totalHours: row.totalHours,
            avgHoursPerDay: row.avgHoursPerDay,
          });
        });
        
        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        return {
          data: Buffer.from(buffer as any).toString('base64'),
          filename: `attendance_summary_by_group_${input.startDate}_to_${input.endDate}.xlsx`,
        };
      }),
    
    // Export attendance summary by cost center
    summaryByCostCenter: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const data = await db.getAttendanceSummaryByCostCenter(
          input.startDate,
          input.endDate
        );
        
        // Generate Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('ملخص الحضور بمركز التكلفة');
        
        // Add headers
        worksheet.columns = [
          { header: 'مركز التكلفة', key: 'costCenterName', width: 20 },
          { header: 'عدد المجموعات', key: 'totalGroups', width: 12 },
          { header: 'عدد العمال', key: 'totalWorkers', width: 12 },
          { header: 'عدد الحضور', key: 'totalCheckIns', width: 12 },
          { header: 'عدد الانصراف', key: 'totalCheckOuts', width: 12 },
          { header: 'أيام الحضور', key: 'daysWithAttendance', width: 12 },
          { header: 'إجمالي الساعات', key: 'totalHours', width: 15 },
          { header: 'متوسط الساعات/اليوم', key: 'avgHoursPerDay', width: 15 },
        ];
        
        // Style header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
        worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
        
        // Add data rows
        data.forEach((row: any) => {
          worksheet.addRow({
            costCenterName: row.costCenterName,
            totalGroups: row.totalGroups,
            totalWorkers: row.totalWorkers,
            totalCheckIns: row.totalCheckIns,
            totalCheckOuts: row.totalCheckOuts,
            daysWithAttendance: row.daysWithAttendance,
            totalHours: row.totalHours,
            avgHoursPerDay: row.avgHoursPerDay,
          });
        });
        
        // Generate buffer
        const buffer = await workbook.xlsx.writeBuffer();
        
        return {
          data: Buffer.from(buffer as any).toString('base64'),
          filename: `attendance_summary_by_cost_center_${input.startDate}_to_${input.endDate}.xlsx`,
        };
      }),
    
    // Export payroll report
    payrollReport: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Get batch details
        const batch = await db.getPayrollBatchDetails(input.batchId);
        if (!batch) throw new Error("Batch not found");
        
        // Transform to Excel format
        const excelData: PayrollReportRow[] = batch.items.map(item => ({
          workerName: item.workerName,
          workerCode: item.workerCode,
          groupName: '', // Group name not in payroll items
          baseSalary: parseFloat(item.baseAmount || '0'),
          deductions: parseFloat(item.totalDeductions || '0'),
          bonuses: parseFloat(item.totalBonuses || '0'),
          netSalary: parseFloat(item.netAmount || '0'),
        }));
        
        // Generate Excel buffer
        const buffer = await generatePayrollExcel(
          excelData,
          batch.batch.batchCode || `دفعة ${batch.batch.id}`,
          `${batch.batch.periodStart.toLocaleDateString('en-CA')} - ${batch.batch.periodEnd.toLocaleDateString('en-CA')}`
        );
        
        // Return base64 encoded buffer
        return {
          data: buffer.toString('base64'),
          filename: `payroll_batch_${batch.batch.id}.xlsx`,
        };
      }),
});
