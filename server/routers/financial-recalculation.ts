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

  // Financial Recalculation (Global Recalculator)
export const financialRecalculationRouter = router({
    // Recalculate financial records for a date range
    recalculateRange: adminProcedure
      .input(z.object({
        startDate: z.string(), // "2026-02-01"
        endDate: z.string(),   // "2026-02-28"
        groupId: z.number().optional(),
        costCenterId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const startTime = Date.now();
        const results: any[] = [];
        const errors: string[] = [];
        
        try {
          // Get list of workers based on filters
          let workers: any[] = [];
          
          if (input.groupId) {
            workers = await db.getWorkersByGroup(input.groupId);
          } else if (input.costCenterId) {
            // Get all groups in this cost center
            const groups = await db.getGroupsByCostCenter(input.costCenterId);
            const groupIds = groups.map((g: any) => g.id);
            
            // Get all workers in these groups
            for (const groupId of groupIds) {
              const groupWorkers = await db.getWorkersByGroup(groupId);
              workers.push(...groupWorkers);
            }
          } else {
            // Get all active workers
            workers = await db.getAllWorkers();
          }
          
          // Filter only active workers
          workers = workers.filter((w: any) => w.isActive);
          
          // Generate list of dates in range
          const dates: string[] = [];
          const start = new Date(input.startDate);
          const end = new Date(input.endDate);
          
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
          }
          
          // Recalculate for each worker and each date
          for (const worker of workers) {
            for (const dateStr of dates) {
              try {
                const result = await db.calculateDailyFinanceFromAttendance(worker.id, dateStr);
                results.push({
                  workerId: worker.id,
                  workerName: worker.fullName,
                  date: dateStr,
                  success: true,
                  ...result,
                });
              } catch (error: any) {
                errors.push(`${worker.fullName} (${dateStr}): ${error.message}`);
                results.push({
                  workerId: worker.id,
                  workerName: worker.fullName,
                  date: dateStr,
                  success: false,
                  error: error.message,
                });
              }
            }
          }
          
          const duration = Date.now() - startTime;
          
          // Log audit
          await db.logAudit({
            userId: ctx.user.id,
            action: 'RECALCULATE_FINANCES',
            tableName: 'worker_daily_finance',
            newValues: {
              startDate: input.startDate,
              endDate: input.endDate,
              groupId: input.groupId,
              costCenterId: input.costCenterId,
              workersProcessed: workers.length,
              daysProcessed: dates.length,
              recordsUpdated: results.filter(r => r.success).length,
              duration,
            },
          });
          
          return {
            success: true,
            workersProcessed: workers.length,
            daysProcessed: dates.length,
            recordsUpdated: results.filter(r => r.success).length,
            errors,
            duration,
          };
        } catch (error: any) {
          console.error('[Financial Recalculation] Error:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'فشل إعادة الحساب',
          });
        }
      }),
});
