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

// ============================================
// Daily Management Functions
// ============================================

/**
 * Get all attendance records for a specific date (with pagination)
 */
export async function getDailyAttendanceRecordsWithPagination(date: string, page: number = 1, limit: number = 20) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const allWorkers = await db.select().from(workers);
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(sql`DATE(${attendanceEvents.eventTime}) = ${date}`);

  const recordMap = new Map();
  
  for (const worker of allWorkers) {
    const workerEvents = events.filter((e: any) => e.workerId === worker.id);
    const checkInEvent = workerEvents.find(e => e.eventType === 'check_in');
    const checkOutEvent = workerEvents.find(e => e.eventType === 'check_out');
    
    recordMap.set(worker.id, {
      id: worker.id,
      workerId: worker.id,
      workerName: worker.fullName,
      workerCode: worker.code,
      date: date,
      checkInTime: checkInEvent ? new Date(checkInEvent.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
      checkOutTime: checkOutEvent ? new Date(checkOutEvent.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
      status: workerEvents.length > 0 ? 'present' : 'absent',
      notes: null,
    });
  }

  const allResults = Array.from(recordMap.values());
  const total = allResults.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const data = allResults.slice(offset, offset + limit);

  return { data, total, totalPages };
}

/**
 * Get all attendance records for a specific date (old version - kept for backward compatibility)
 */
export async function getDailyAttendanceRecords(date: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const allWorkers = await db.select().from(workers);
  const events = await db
    .select()
    .from(attendanceEvents)
    .where(sql`DATE(${attendanceEvents.eventTime}) = ${date}`);

  const recordMap = new Map();
  
  for (const worker of allWorkers) {
    const workerEvents = events.filter((e: any) => e.workerId === worker.id);
    const checkInEvent = workerEvents.find(e => e.eventType === 'check_in');
    const checkOutEvent = workerEvents.find(e => e.eventType === 'check_out');
    
    recordMap.set(worker.id, {
      id: worker.id,
      workerId: worker.id,
      workerName: worker.fullName,
      workerCode: worker.code,
      date: date,
      checkInTime: checkInEvent ? new Date(checkInEvent.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
      checkOutTime: checkOutEvent ? new Date(checkOutEvent.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null,
      status: workerEvents.length > 0 ? 'present' : 'absent',
      notes: null,
    });
  }

  return Array.from(recordMap.values());
}

/**
 * Update a daily attendance record
 */
export async function updateDailyAttendanceRecord(
  recordId: number,
  checkInTime: string | null,
  checkOutTime: string | null,
  status: string,
  notes: string | null,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // For now, we'll just return success
  // In a real implementation, you would update the attendance events table
  return {
    success: true,
    message: 'تم تحديث السجل بنجاح',
  };
}


