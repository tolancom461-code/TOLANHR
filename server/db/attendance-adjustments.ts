import { eq, desc, and, or, like, gte, lt, lte, ne, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { getAdministrativeWorkDate } from '../attendance-logic';
import { 
  users, InsertUser, User,
  costCenters,
  groups, Group, InsertGroup,
  groupSchedules,
  workers, InsertWorker,
  attendanceEvents,
  workDays,
  workerDailyFinance,
  payOverrides,
  payrollBatches,
  payrollBatchItems,
  payrollBatchNotes,
  payrollBatchCorrections,
  operationalFlags,
  userCostCenters,
  temporaryAssignments,
  assignmentSettlements,
  deductionRules,
  auditLog,
  notifications,
  pushSubscriptions,
  restaurants,
  dailyWorkAssignments
} from "../../drizzle/schema";
import { sendNotification, sendNotificationToRoles, notifyStageAndAdmins, ADMIN_OWNER_ROLES } from '../notifications';
import { getRoleLabel } from '../permissions';
import { inArray, isNull, isNotNull, between } from "drizzle-orm";
import type { Worker as DbWorker } from "../../drizzle/schema";
import { ENV } from '../_core/env';
import { getDb } from './connection';
import { processAttendanceToFinance } from './daily-finance';
import { checkPayrollBatchForDate } from './payroll-locks';

// ============================================
// Attendance Adjustment Functions
// ============================================

export async function getAttendanceEventById(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const { attendanceEvents } = await import('../../drizzle/schema');
  
  const [event] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, eventId)).limit(1);
  return event || null;
}

export async function updateAttendanceEvent(
  eventId: number, 
  newTime: string, 
  internalNote?: string,
  updatedBy?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, auditLog } = await import('../../drizzle/schema');
  
  // Get original event
  const [original] = await db.select().from(attendanceEvents).where(eq(attendanceEvents.id, eventId)).limit(1);
  if (!original) throw new Error("سجل الحضور غير موجود");
  
// Check if payroll batch exists for this date
  // ✅ قاعدة 5 صباحاً: نستخدم اليوم الإداري بدلاً من التاريخ الميلادي
  const eventDate = getAdministrativeWorkDate(new Date(original.eventTime));
  const batch = await checkPayrollBatchForDate(eventDate);
  if (batch) {
    throw new Error(`لا يمكن تعديل الحضور بعد إنشاء دفعة العمال. يجب حذف المسودة أولاً (دفعة رقم: ${batch.batchCode})`);
  }
  
  // Update event
  const updateData: any = {
    eventTime: new Date(newTime),
  };
  if (internalNote !== undefined) {
    updateData.note = internalNote;
  }
  await db.update(attendanceEvents).set(updateData).where(eq(attendanceEvents.id, eventId));
  
  // Log the change
  await db.insert(auditLog).values({
    userId: updatedBy,
    action: 'UPDATE_ATTENDANCE',
    tableName: 'attendance_events',
    recordId: eventId,
    oldValues: JSON.stringify({ eventTime: original.eventTime, note: original.note }),
    newValues: JSON.stringify({ eventTime: newTime, note: internalNote }),
  });
  
  // Recalculate daily finance
  // ✅ قاعدة 5 صباحاً: نستخدم اليوم الإداري بدلاً من التاريخ الميلادي
  const workDate = getAdministrativeWorkDate(new Date(original.eventTime));
  await processAttendanceToFinance(original.workerId, workDate);
  
  return { success: true };
}

export async function getAttendanceEventsForEdit(workerId: number, workDate: string) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents } = await import('../../drizzle/schema');
  
// ✅ قاعدة 5 صباحاً: اليوم الإداري يبدأ 5 صباحاً ويمتد حتى 4:59 صباحاً اليوم التالي
  const dateStart = new Date(workDate + 'T05:00:00+03:00');
  const nextDay1 = new Date(workDate);
  nextDay1.setDate(nextDay1.getDate() + 1);
  const nextDayStr1 = nextDay1.toLocaleDateString('en-CA');
  const dateEnd = new Date(nextDayStr1 + 'T04:59:59+03:00');
  
  return await db
    .select()
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, workerId),
      gte(attendanceEvents.eventTime, dateStart),
      lte(attendanceEvents.eventTime, dateEnd)
    ))
    .orderBy(attendanceEvents.eventTime);
}

export async function getAttendanceEventsByGroup(groupId: number, workDate: string) {
  const db = await getDb();
  if (!db) return [];

  const { attendanceEvents, workers } = await import('../../drizzle/schema');
  
  // Get all workers in the group
  const groupWorkers = await db
    .select()
    .from(workers)
    .where(eq(workers.groupId, groupId));
  
  if (groupWorkers.length === 0) return [];
  
  const workerIds = groupWorkers.map(w => w.id);
  
// ✅ قاعدة 5 صباحاً: اليوم الإداري يبدأ 5 صباحاً ويمتد حتى 4:59 صباحاً اليوم التالي
  const dateStart = new Date(workDate + 'T05:00:00+03:00');
  const nextDay2 = new Date(workDate);
  nextDay2.setDate(nextDay2.getDate() + 1);
  const nextDayStr2 = nextDay2.toLocaleDateString('en-CA');
  const dateEnd = new Date(nextDayStr2 + 'T04:59:59+03:00');
    
  // Get all events for all workers in the group
  const events = await db
    .select({
      id: attendanceEvents.id,
      workerId: attendanceEvents.workerId,
      eventType: attendanceEvents.eventType,
      eventTime: attendanceEvents.eventTime,
      method: attendanceEvents.method,
      note: attendanceEvents.note,
      workerName: workers.fullName,
      workerCode: workers.code,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .where(and(
      sql`${attendanceEvents.workerId} IN (${sql.join(workerIds.map(id => sql`${id}`), sql`, `)})`,
      gte(attendanceEvents.eventTime, dateStart),
      lte(attendanceEvents.eventTime, dateEnd)
    ))
    .orderBy(workers.fullName, attendanceEvents.eventTime);
  
  return events;
}

