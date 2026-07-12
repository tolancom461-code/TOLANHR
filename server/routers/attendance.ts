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

  // Attendance System (Phase 4)
export const attendanceRouter = router({
    // Record check-in or check-out
    record: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        eventType: z.enum(['check_in', 'check_out']),
        method: z.string().default('manual'),
      }))
      .mutation(async ({ input, ctx }) => {
        return await db.recordAttendance(
          input.workerId,
          input.eventType,
          input.method,
          undefined,
          ctx.user?.id
        );
      }),
    
    // Get worker info from QR code or manual code (without recording)
    getWorkerFromQR: publicProcedure
      .input(z.object({ qrToken: z.string() }))
      .query(async ({ input }) => {
        // Try to find worker by QR token first
        let worker: any = await db.getWorkerByQRToken(input.qrToken);
        
        // If not found, try to extract code from token and search by code
        if (!worker && input.qrToken.startsWith('WRK-')) {
          const parts = input.qrToken.split('-');
          if (parts.length >= 2) {
            const code = parts[1];
            worker = await db.getWorkerByCode(code);
          }
        }
        
        if (!worker) throw new Error("رمز QR غير صالح");
        
        // Get last event for display purposes only
        const lastEvent = await db.getWorkerLastEvent(worker.id);
        
        // Get today's events
        const today = new Date().toLocaleDateString('en-CA');
        const todayEventsRaw = await db.getAttendanceEventsForEdit(worker.id, today);
        
        // Convert snake_case from DB to camelCase for frontend
        const todayEvents = todayEventsRaw.map((event: any) => ({
          ...event,
          eventTime: event.event_time || event.eventTime,
          eventType: event.event_type || event.eventType,
          workerId: event.worker_id || event.workerId,
        }));
        
        // ✅ Calculate nextEventType using the same logic as recordAttendanceWithAdministrativeDay
        const eventTime = new Date();
        const fifteenHoursAgo = new Date(eventTime.getTime() - 15 * 60 * 60 * 1000);
        
        const database = await db.getDb();
        if (!database) throw new Error("Database not available");
        
        const lastCheckIn = await database.select()
          .from(attendanceEvents)
          .where(
            and(
              eq(attendanceEvents.workerId, worker.id),
              eq(attendanceEvents.eventType, 'check_in'),
              gte(attendanceEvents.eventTime, fifteenHoursAgo)
            )
          )
          .orderBy(desc(attendanceEvents.eventTime))
          .limit(1);
        
        let nextEventType: 'check_in' | 'check_out';
        
        // إذا لم يوجد حضور في آخر 15 ساعة، افتح حضور جديد
        if (lastCheckIn.length === 0) {
          nextEventType = 'check_in';
        } else {
          // يوجد حضور، تحقق من وجود انصراف له
          const checkInTime = lastCheckIn[0].eventTime;
          
          const matchingCheckOut = await database.select()
            .from(attendanceEvents)
            .where(
              and(
                eq(attendanceEvents.workerId, worker.id),
                eq(attendanceEvents.eventType, 'check_out'),
                gte(attendanceEvents.eventTime, checkInTime)
              )
            )
            .limit(1);
          
          // إذا لم يوجد انصراف، سجل انصراف
          if (matchingCheckOut.length === 0) {
            nextEventType = 'check_out';
          } else {
            // يوجد حضور وانصراف، افتح حضور جديد
            nextEventType = 'check_in';
          }
        }
        
        return { 
          worker, 
          lastEvent: lastEvent ? {
            ...lastEvent,
            eventTime: lastEvent.eventTime instanceof Date 
              ? lastEvent.eventTime.toISOString() 
              : new Date(lastEvent.eventTime).toISOString()
          } : null,
          todayEvents: todayEvents.map((e: any) => ({
            ...e,
            eventTime: e.eventTime instanceof Date 
              ? e.eventTime.toISOString() 
              : new Date(e.eventTime).toISOString()
          })),
          nextEventType
        };
      }),

    // Get count of pending punches
    getPendingCount: protectedProcedure
      .query(async ({ ctx }) => {
        // جلب عدد البصمات المعلقة من قاعدة البيانات
        try {
          const database = await db.getDb();
          if (!database) return 0;
          
          // استخدم Drizzle ORM للعد
          const result = await database.select()
            .from(attendanceEvents)
            .where(sql`is_automatic = 1`);
          
          return result.length || 0;
        } catch (error) {
          console.error('Error getting pending count:', error);
          return 0;
        }
      }),
    
    // Get attendance events for review - returns ONLY incomplete (unpaired) records
    getForReview: protectedProcedure
      .input(z.object({
        workDateStr: z.string(), // YYYY-MM-DD format to avoid Date serialization issues
        status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(),
      }))
      .query(async ({ input }) => {
        // Parse the date string to Date object for the query
        const workDate = new Date(`${input.workDateStr}T00:00:00`);
        // Get incomplete attendance records for the date
        const incompleteRecords = await db.getIncompleteAttendance(workDate);
        
        // Transform incomplete records - these are the ONLY records that need review
        const incompleteTransformed = incompleteRecords.map(record => ({
          id: record.checkInId || record.checkOutId || 0,
          workerId: record.workerId,
          workerName: record.workerName,
          workerCode: record.workerCode,
          groupId: record.groupId,
          groupName: record.groupName,
          incompleteType: record.incompleteType,
          checkInId: record.checkInId,
          checkInTime: record.checkInTime,
          checkOutId: record.checkOutId,
          checkOutTime: record.checkOutTime,
        }));
        
        return incompleteTransformed;
      }),
    
    // Get absent workers for a specific date
    getAbsentWorkers: protectedProcedure
      .input(z.object({
        workDateStr: z.string(), // YYYY-MM-DD format for stable query key
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const workDate = new Date(`${input.workDateStr}T00:00:00`);
        return await db.getAbsentWorkers(workDate, input.groupId);
      }),
    
    // Approve a punch record
    approvePunch: protectedProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return { success: true, message: 'تم الموافقة على البصمة' };
      }),
    
    // Reject a punch record
    rejectPunch: protectedProcedure
      .input(z.object({
        id: z.number(),
        note: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return { success: true, message: 'تم رفض البصمة' };
      }),
    
    // Add missing check-in for incomplete attendance
    addMissingCheckIn: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        checkInTime: z.string(), // ISO string
        note: z.string().optional(),
      }))
      .use(requirePermissionFlag('canEditAttendanceLog'))
      .mutation(async ({ input, ctx }) => {
        try {
          if (!ctx.user) throw new Error("Not authenticated");
          
          const { attendanceEvents } = await import('../../drizzle/schema');
          const { getAdministrativeWorkDate } = await import('../attendance-logic');
          const database = await db.getDb();
          if (!database) throw new Error('Database not available');
          
          // Validate date
          const eventTime = new Date(input.checkInTime);
          if (isNaN(eventTime.getTime())) {
            throw new Error('تاريخ غير صالح');
          }
          
          // ✅ حساب تاريخ يوم العمل الإداري من وقت البصمة
          const workDate = getAdministrativeWorkDate(eventTime);
          
          // Insert check-in event
          await database.insert(attendanceEvents).values({
            workerId: input.workerId,
            eventType: 'check_in',
            eventTime: eventTime,
            workDate: new Date(workDate + 'T00:00:00'), // ✅ إضافة تاريخ يوم العمل
            method: 'manual',
            note: input.note || 'تم إضافة الحضور يدوياً لمعالجة بصمة ناقصة',
          });
          
          // Try to recalculate finance if both check_in and check_out exist now
          try {
            await db.processAttendanceToFinance(input.workerId, workDate);
          } catch (finError) {
            console.error('[addMissingCheckIn] Finance recalc failed (non-fatal):', finError);
          }
          
          // Get worker name for audit log
          const worker = await db.getWorkerById(input.workerId);
          const workerName = worker?.fullName || `عامل رقم ${input.workerId}`;
          
          await db.logAudit({
            userId: ctx.user.id,
            action: 'ADD_MISSING_CHECK_IN',
            tableName: 'attendance_events',
            newValues: { workerId: input.workerId, workerName: workerName, eventTime: input.checkInTime, note: input.note },
          });
          return { success: true, message: 'تم إضافة بصمة الحضور بنجاح' };
        } catch (error: any) {
          console.error('[addMissingCheckIn] Error:', error);
          throw new Error(error.message || 'فشل إضافة الحضور');
        }
      }),
    
    // Add missing check-out for incomplete attendance
    addMissingCheckOut: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        checkOutTime: z.string(), // ISO string
        note: z.string().optional(),
      }))
      .use(requirePermissionFlag('canEditAttendanceLog'))
      .mutation(async ({ input, ctx }) => {
        try {
          if (!ctx.user) throw new Error("Not authenticated");
          
          const { attendanceEvents } = await import('../../drizzle/schema');
          const { getAdministrativeWorkDate } = await import('../attendance-logic');
          const database = await db.getDb();
          if (!database) throw new Error('Database not available');
          
          // Validate date
          const eventTime = new Date(input.checkOutTime);
          if (isNaN(eventTime.getTime())) {
            throw new Error('تاريخ غير صالح');
          }
          
          // ✅ حساب تاريخ يوم العمل الإداري من وقت البصمة
          const workDate = getAdministrativeWorkDate(eventTime);
          
          // Insert check-out event
          await database.insert(attendanceEvents).values({
            workerId: input.workerId,
            eventType: 'check_out',
            eventTime: eventTime,
            workDate: new Date(workDate + 'T00:00:00'), // ✅ إضافة تاريخ يوم العمل
            method: 'manual',
            note: input.note || 'تم إضافة الانصراف يدوياً لمعالجة بصمة ناقصة',
          });
          
          // Auto-calculate finance after adding check_out
          // Use check_in's date as work date (handles night shifts crossing midnight)
          try {
            const financeWorkDate = await db.getWorkDateForCheckOut(input.workerId, eventTime);
            await db.processAttendanceToFinance(input.workerId, financeWorkDate);
          } catch (finError) {
            console.error('[addMissingCheckOut] Finance calc failed (non-fatal):', finError);
          }
          
          // Get worker name for audit log
          const worker = await db.getWorkerById(input.workerId);
          const workerName = worker?.fullName || `عامل رقم ${input.workerId}`;
          
          await db.logAudit({
            userId: ctx.user.id,
            action: 'ADD_MISSING_CHECK_OUT',
            tableName: 'attendance_events',
            newValues: { workerId: input.workerId, workerName: workerName, eventTime: input.checkOutTime, note: input.note },
          });
          return { success: true, message: 'تم إضافة بصمة الانصراف بنجاح' };
        } catch (error: any) {
          console.error('[addMissingCheckOut] Error:', error);
          throw new Error(error.message || 'فشل إضافة الانصراف');
        }
      }),
    
// Add a full session (check_in + check_out) for a worker
addFullSession: protectedProcedure
  .input(z.object({
    workerId: z.number(),
    checkInTime: z.string(),  // ISO string
    checkOutTime: z.string(), // ISO string
    note: z.string().optional(),
  }))
  .use(requirePermissionFlag('canEditAttendanceLog'))
  .mutation(async ({ input, ctx }) => {
    try {
      if (!ctx.user) throw new Error("Not authenticated");
      
      const { attendanceEvents } = await import('../../drizzle/schema');
      const { getAdministrativeWorkDate } = await import('../attendance-logic');
      const database = await db.getDb();
      if (!database) throw new Error('Database not available');
      
      const checkInTime = new Date(input.checkInTime);
      const checkOutTime = new Date(input.checkOutTime);
      
      if (isNaN(checkInTime.getTime()) || isNaN(checkOutTime.getTime())) {
        throw new Error('تاريخ غير صالح');
      }
      
      if (checkOutTime <= checkInTime) {
        throw new Error('وقت الخروج يجب أن يكون بعد وقت الدخول');
      }
      
      // حساب تاريخ اليوم الإداري
      const workDate = getAdministrativeWorkDate(checkInTime);
      
      // إضافة بصمة الدخول
      await database.insert(attendanceEvents).values({
        workerId: input.workerId,
        eventType: 'check_in',
        eventTime: checkInTime,
        workDate: workDate,
        method: 'manual',
        note: input.note || 'تم إضافة جلسة كاملة يدوياً',
      });
      
      // إضافة بصمة الخروج
      await database.insert(attendanceEvents).values({
        workerId: input.workerId,
        eventType: 'check_out',
        eventTime: checkOutTime,
        workDate: workDate,
        method: 'manual',
        note: input.note || 'تم إضافة جلسة كاملة يدوياً',
      });
      
      // إعادة حساب المالية
      try {
        await db.processAttendanceToFinance(input.workerId, workDate);
      } catch (finError) {
        console.error('[addFullSession] Finance calc failed (non-fatal):', finError);
      }
      
      // تسجيل في سجل التدقيق
      const worker = await db.getWorkerById(input.workerId);
      await db.logAudit({
        userId: ctx.user.id,
        action: 'ADD_FULL_SESSION',
        tableName: 'attendance_events',
        newValues: { 
          workerId: input.workerId,
          workerName: worker?.fullName,
          checkInTime: input.checkInTime,
          checkOutTime: input.checkOutTime,
          workDate,
        },
      });
      
      return { success: true, message: 'تم إضافة الجلسة بنجاح', workDate };
    } catch (error: any) {
      console.error('[addFullSession] Error:', error);
      throw new Error(error.message || 'فشل إضافة الجلسة');
    }
  }),

    // Delete an attendance event (for incorrect punches)
    deletePunchEvent: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        reason: z.string().optional(),
      }))
      .use(requirePermissionFlag('canEditAttendanceLog'))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const { attendanceEvents } = await import('../../drizzle/schema');
        const database = await db.getDb();
        if (!database) throw new Error('Database not available');
        
        // Get event before deleting for audit
        const { eq } = await import('drizzle-orm');
        const [oldEvent] = await database.select().from(attendanceEvents).where(eq(attendanceEvents.id, input.eventId)).limit(1);
        
        // Delete the event
        await database.delete(attendanceEvents).where(eq(attendanceEvents.id, input.eventId));
        
        // Get worker name for audit log
        let workerName = `عامل غير معروف`;
        if (oldEvent?.workerId) {
          const worker = await db.getWorkerById(oldEvent.workerId);
          workerName = worker?.fullName || `عامل رقم ${oldEvent.workerId}`;
        }
        
        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'DELETE_ATTENDANCE',
          tableName: 'attendance_events',
          recordId: input.eventId,
          oldValues: oldEvent ? { workerId: oldEvent.workerId, workerName: workerName, eventType: oldEvent.eventType, eventTime: oldEvent.eventTime } : null,
          newValues: input.reason ? { reason: input.reason } : null,
        });
        
        // ✅ إعادة حساب أو حذف السجل المالي
        if (oldEvent?.workerId && oldEvent?.workDate) {
          const { and } = await import('drizzle-orm');
          
          // التحقق من وجود بصمات أخرى في نفس اليوم الإداري
          const remainingEvents = await database.select()
            .from(attendanceEvents)
            .where(and(
              eq(attendanceEvents.workerId, oldEvent.workerId),
              eq(attendanceEvents.workDate, oldEvent.workDate)
            ));
          
          if (remainingEvents.length === 0) {
            // لا توجد بصمات متبقية - حذف السجل المالي
            await db.deleteDailyFinanceByWorkerAndDate(oldEvent.workerId, oldEvent.workDate);
          } else {
            // توجد بصمات متبقية - إعادة حساب السجل المالي
            await db.processAttendanceToFinance(oldEvent.workerId, oldEvent.workDate);
          }
        }
        
        return { success: true, message: 'تم حذف البصمة بنجاح' };
      }),

    // Confirm and record attendance
    confirmAttendance: protectedProcedure
      .input(z.object({ 
        workerId: z.number(),
        ipAddress: z.string().optional(),
        deviceInfo: z.string().optional(),
        eventType: z.enum(['check_in', 'check_out']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await db.recordAttendanceWithAdministrativeDay(
          input.workerId,
          'qr',
          undefined,
          ctx.user?.id,
          input.ipAddress,
          input.deviceInfo,
          input.eventType
        );
        
        return result;
      }),
    
    // Scan QR code to get worker and record attendance (legacy - kept for compatibility)
    scanQR: protectedProcedure
      .input(z.object({ qrToken: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const worker = await db.getWorkerByQRToken(input.qrToken);
        if (!worker) throw new Error("رمز QR غير صالح");
        
        // Get last event for display purposes only
        const lastEvent = await db.getWorkerLastEvent(worker.id);
        
        // ✅ استخدام الدالة الذكية
        const result = await db.recordAttendanceWithAdministrativeDay(
          worker.id,
          'qr',
          undefined,
          ctx.user?.id
        );
        
        return { ...result, worker };
      }),
    
    // Manual code entry
    manualEntry: protectedProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const worker = await db.getWorkerByManualCode(input.code);
        if (!worker) throw new Error("الرمز غير صالح");
        
        const lastEvent = await db.getWorkerLastEvent(worker.id);
        
        // ✅ استخدام الدالة الذكية
        const result = await db.recordAttendanceWithAdministrativeDay(
          worker.id,
          'manual',
          undefined,
          ctx.user?.id
        );
        
        return { ...result, worker };
      }),
    
    // Get today's attendance log (paginated)
    todayLogWithPagination: protectedProcedure
      .input(z.object({ 
        groupId: z.number().optional(),
        date: z.string().optional(), // Format: YYYY-MM-DD
        page: z.number().default(1),
        limit: z.number().default(20)
      }))
      .query(async ({ input }) => {
        return await db.getTodayAttendanceWithPagination(input.groupId, input.date, input.page, input.limit);
      }),
    
    // Get today's attendance log (old version - kept for backward compatibility)
    todayLog: protectedProcedure
      .input(z.object({ 
        groupId: z.number().optional(),
        date: z.string().optional() // Format: YYYY-MM-DD
      }))
      .query(async ({ input }) => {
        return await db.getTodayAttendance(input.groupId, input.date);
      }),
    
    // Check if date has approved payroll batch
    checkDateLocked: protectedProcedure
      .input(z.object({ date: z.string() })) // Format: YYYY-MM-DD
      .query(async ({ input }) => {
        const batch = await db.checkPayrollBatchForDate(input.date);
        return {
          isLocked: !!batch,
          batch: batch ? {
            id: batch.id,
            batchCode: batch.batchCode,
            status: batch.status
          } : null
        };
      }),
    
    // Get worker's last event today
    workerLastEvent: protectedProcedure
      .input(z.object({ workerId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWorkerLastEvent(input.workerId);
      }),
    
    // Get monthly report
    monthlyReport: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getMonthlyAttendanceReport(input.year, input.month, input.groupId);
      }),
    
    // Get date range report
    dateRangeReport: protectedProcedure
      .input(z.object({
        startDate: z.string(), // YYYY-MM-DD
        endDate: z.string(), // YYYY-MM-DD
        groupId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getDateRangeAttendanceReport(input.startDate, input.endDate, input.groupId);
      }),
    
    // Get attendance stats
    stats: protectedProcedure
      .input(z.object({ 
        groupId: z.number().optional(),
        date: z.string().optional() // Format: YYYY-MM-DD
      }))
      .query(async ({ input }) => {
        let targetDate: Date;
        if (input.date) {
          // If date provided explicitly, use it as-is (set to start of day in Riyadh time)
          targetDate = new Date(input.date + 'T00:00:00+03:00');
        } else {
          // No date provided: apply administrative day logic
          // If current time is before 5 AM (Riyadh), use yesterday's administrative date
          const now = new Date();
          const riyadhHour = parseInt(
            now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh', hour: 'numeric', hour12: false })
          );
          if (riyadhHour < 5) {
            // Before 5 AM: belongs to previous administrative day
            now.setDate(now.getDate() - 1);
          }
          // Set to start of that day in Riyadh time
          const riyadhDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
          targetDate = new Date(riyadhDateStr + 'T00:00:00+03:00');
        }
        const tomorrow = new Date(targetDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return await db.getAttendanceStats(targetDate, tomorrow, input.groupId);
      }),
    
    // Bulk update attendance times
    bulkUpdate: protectedProcedure
      .input(z.object({
        eventIds: z.array(z.number()),
        adjustmentMinutes: z.number(),
        internalNote: z.string().optional(),
      }))
      .use(requirePermissionFlag('canEditAttendanceLog'))
      .mutation(async ({ input, ctx }) => {
        const results = [];
        for (const eventId of input.eventIds) {
          try {
            const event = await db.getAttendanceEventById(eventId);
            if (!event) {
              results.push({ eventId, success: false, error: 'Event not found' });
              continue;
            }
            
            const currentTime = new Date(event.eventTime);
            const newTime = new Date(currentTime.getTime() + input.adjustmentMinutes * 60 * 1000);
            
            await db.updateAttendanceEvent(eventId, newTime.toISOString(), input.internalNote);
            
            // Get worker name for audit log
            let workerName = `عامل غير معروف`;
            if (event.workerId) {
              const worker = await db.getWorkerById(event.workerId);
              workerName = worker?.fullName || `عامل رقم ${event.workerId}`;
            }
            
            await db.logAudit({ userId: ctx.user?.id, action: 'BULK_UPDATE_ATTENDANCE', tableName: 'attendance_events', recordId: eventId, oldValues: { eventTime: event.eventTime, workerId: event.workerId, workerName: workerName }, newValues: { adjustmentMinutes: input.adjustmentMinutes, note: input.internalNote } });
            results.push({ eventId, success: true });
          } catch (error) {
            results.push({ eventId, success: false, error: String(error) });
          }
        }
        return results;
      }),

    // Get daily attendance records for a specific date (paginated)
    getDailyRecordsWithPagination: protectedProcedure
      .input(z.object({
        date: z.string(),
        page: z.number().default(1),
        limit: z.number().default(20)
      }))
      .query(async ({ input }) => {
        return await db.getDailyAttendanceRecordsWithPagination(input.date, input.page, input.limit);
      }),
    
    // Get daily attendance records for a specific date (old version - kept for backward compatibility)
    getDailyRecords: protectedProcedure
      .input(z.object({
        date: z.string(),
      }))
      .query(async ({ input }) => {
        return await db.getDailyAttendanceRecords(input.date);
      }),

    // Update a daily attendance record
    updateDailyRecord: protectedProcedure
      .input(z.object({
        recordId: z.number(),
        checkInTime: z.string().nullable(),
        checkOutTime: z.string().nullable(),
        status: z.enum(['present', 'absent', 'late', 'early_leave', 'override']),
        notes: z.string().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const updateRecResult = await db.updateDailyAttendanceRecord(
          input.recordId,
          input.checkInTime,
          input.checkOutTime,
          input.status,
          input.notes,
          ctx.user.id
        );
        await db.logAudit({ userId: ctx.user.id, action: 'UPDATE_DAILY_RECORD', tableName: 'attendance_events', recordId: input.recordId, newValues: { checkInTime: input.checkInTime, checkOutTime: input.checkOutTime, status: input.status, notes: input.notes } });
        return updateRecResult;
      }),

    // Recalculate daily finance for a specific date
    recalculateDailyFinance: protectedProcedure
      .input(z.object({
        date: z.string(), // Format: YYYY-MM-DD
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const targetDate = input.date;
        const results: Array<{ workerId: number; success: boolean; error?: string }> = [];
        
        // Get all check_out events for the target date
        const checkOutEvents = await db.getCheckOutEventsByDate(targetDate);
        
        // Recalculate for each worker who has a check_out
        for (const checkOut of checkOutEvents) {
          try {
            await db.processAttendanceToFinance(checkOut.workerId, targetDate);
            results.push({ workerId: checkOut.workerId, success: true });
          } catch (error) {
            results.push({ workerId: checkOut.workerId, success: false, error: String(error) });
          }
        }
        
        return { success: true, results, recalculated: results.length };
      }),
    
    // Recalculate daily finance for a period (all days)
    recalculatePeriod: protectedProcedure
      .input(z.object({
        periodStart: z.string(), // YYYY-MM-DD
        periodEnd: z.string(), // YYYY-MM-DD
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        const start = new Date(input.periodStart);
        const end = new Date(input.periodEnd);
        const totalResults: Array<{ date: string; workerId: number; success: boolean; error?: string }> = [];
        
        // Iterate through each day in the period
        const current = new Date(start);
        while (current <= end) {
          const dateStr = current.toLocaleDateString('en-CA');
          
          // Get all check_out events for this date
          const checkOutEvents = await db.getCheckOutEventsByDate(dateStr);
          
          for (const checkOut of checkOutEvents) {
            try {
              await db.processAttendanceToFinance(checkOut.workerId, dateStr);
              totalResults.push({ date: dateStr, workerId: checkOut.workerId, success: true });
            } catch (error) {
              totalResults.push({ date: dateStr, workerId: checkOut.workerId, success: false, error: String(error) });
            }
          }
          
          current.setDate(current.getDate() + 1);
        }
        
        return { 
          success: true, 
          results: totalResults, 
          recalculated: totalResults.filter(r => r.success).length,
          failed: totalResults.filter(r => !r.success).length,
        };
      }),

    // Update attendance event time
    updateEvent: protectedProcedure
      .input(z.object({
        eventId: z.number(),
        newTime: z.string(), // ISO string
        internalNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        
        // Get event to check date
        const event = await db.getAttendanceEventById(input.eventId);
        if (!event) throw new Error("سجل الحضور غير موجود");
        
        // Check if payroll batch exists for this date
        const eventDate = new Date(event.eventTime).toLocaleDateString('en-CA');
        const batch = await db.checkPayrollBatchForDate(eventDate);
        if (batch) {
          throw new Error(`لا يمكن تعديل الحضور بعد إنشاء دفعة العمال. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
        }
        
        const updateResult = await db.updateAttendanceEvent(
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
        
        await db.logAudit({ userId: ctx.user.id, action: 'UPDATE_ATTENDANCE', tableName: 'attendance_events', recordId: input.eventId, oldValues: event ? { eventTime: event.eventTime, workerId: event.workerId, workerName: workerName } : null, newValues: { newTime: input.newTime, note: input.internalNote } });
        return updateResult;
      }),
    // Export attendance log to Excel
    exportToExcel: protectedProcedure
      .input(z.object({
        date: z.string(),
        groupId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateAttendanceLogExcel } = await import('../excel-export');
        
        // Get attendance log data
        const records = await db.getTodayAttendance(
          input.groupId,
          input.date
        );
        
        // Get group name if groupId is provided
        let groupName = null;
        if (input.groupId) {
          const group = await db.getGroupById(input.groupId);
          groupName = group?.name || null;
        }
        
        const excelBuffer = await generateAttendanceLogExcel(
          input.date,
          groupName,
          records
        );
        
        return {
          data: excelBuffer.toString('base64'),
          filename: `attendance-log-${input.date}.xlsx`
        };
      }),
});
