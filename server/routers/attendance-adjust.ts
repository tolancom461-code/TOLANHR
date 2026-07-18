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

  // Attendance Adjustment (HR)
export const attendanceAdjustRouter = router({
    // Get events for editing
    getEvents: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        workDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getAttendanceEventsForEdit(input.workerId, input.workDate);
      }),
    
    // Get events by group for editing
    getEventsByGroup: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        workDate: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getAttendanceEventsByGroup(input.groupId, input.workDate);
      }),
    
    // Update attendance event
    updateEvent: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        newTime: z.string(), // ISO string
        internalNote: z.string(),
      }))
      .use(requirePermissionFlag('canEditAttendanceLog'))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Get event to check date
        const event = await db.getAttendanceEventById(input.eventId);
        if (!event) throw new Error("Event not found");
        
        // Check if payroll batch exists for this date
        // ✅ القفل مرتبط بالتاريخ + مجموعة العامل
        const eventDate = new Date(event.eventTime).toLocaleDateString('en-CA');
        const adjWorker = await db.getWorkerById(event.workerId);
        const batch = await db.checkPayrollBatchForDate(eventDate, adjWorker?.groupId ?? undefined);
        if (batch) {
          throw new Error(`لا يمكن تعديل الحضور بعد إنشاء دفعة العمال لمجموعة هذا العامل. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
        }
               const result = await db.updateAttendanceEvent(
          input.eventId,
          input.newTime,
          input.internalNote || '',
          ctx.user.id
        );
        // Get worker name for audit log
        let workerName = `عامل غير معروف`;
        if (event?.workerId) {
          const worker = await db.getWorkerById(event.workerId);
          workerName = worker?.fullName || `عامل رقم ${event.workerId}`;
        }
        
        await db.logAudit({
          userId: ctx.user.id,
          action: 'UPDATE_ATTENDANCE',
          tableName: 'attendance_events',
          recordId: input.eventId,
          oldValues: event ? { eventTime: event.eventTime, workerId: event.workerId, workerName: workerName } : null,
          newValues: { newTime: input.newTime, note: input.internalNote },
        });
        return result;
      }),
});
