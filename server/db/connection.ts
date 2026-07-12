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

let _db: ReturnType<typeof drizzle> | null = null;
let _rawConnection: any = null;

// ============================================
// Utility Functions
// ============================================

/**
 * Safely parse a decimal value to float
 * Returns 0 if parsing fails
 */
export function safeParseDecimal(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Safely parse an integer value
 * Returns 0 if parsing fails
 */
export function safeParseInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Group attendance events by WORK DATE (check_in date) instead of calendar date.
 * This correctly handles night shifts where check_out crosses midnight.
 * 
 * Algorithm:
 * 1. Sort events by time
 * 2. For each check_in, the work date = check_in's calendar date
 * 3. For each check_out, find the most recent unmatched check_in for the same worker
 *    and assign the check_out to that check_in's work date
 * 4. Orphan check_outs (no matching check_in) use their own calendar date
 */
export function groupEventsByWorkDate(
  events: Array<{ workerId: number; eventType: string; eventTime: Date; id?: number; [key: string]: any }>
): Record<string, Record<number, { checkIn?: any; checkOut?: any; sessions: Array<{ checkIn?: any; checkOut?: any }>; events: any[] }>> {
  // Sort by time ascending
  const sorted = [...events].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  
  // Track: workDate -> workerId -> { checkIn, checkOut, sessions, events }
  const result: Record<string, Record<number, { checkIn?: any; checkOut?: any; sessions: Array<{ checkIn?: any; checkOut?: any }>; events: any[] }>> = {};
  
  // Track unmatched check_ins per worker (stack: last check_in is most recent)
  const unmatchedCheckIns: Map<number, Array<{ event: any; workDate: string; sessionIndex: number }>> = new Map();
  
  for (const event of sorted) {
    const eventDate = getAdministrativeWorkDate(new Date(event.eventTime));
    
    if (event.eventType === 'check_in') {
      // Work date = check_in's calendar date (always)
      const workDate = eventDate;
      
      if (!result[workDate]) result[workDate] = {};
      if (!result[workDate][event.workerId]) {
        result[workDate][event.workerId] = { events: [], sessions: [] };
      }

      // ✅ إضافة جلسة جديدة
      const sessionIndex = result[workDate][event.workerId].sessions.length;
      result[workDate][event.workerId].sessions.push({ checkIn: event });

      // ✅ checkIn = أول دخول (للتوافق مع الكود القديم)
      if (!result[workDate][event.workerId].checkIn) {
        result[workDate][event.workerId].checkIn = event;
      }

      result[workDate][event.workerId].events.push(event);
      
      // Track as unmatched
      if (!unmatchedCheckIns.has(event.workerId)) {
        unmatchedCheckIns.set(event.workerId, []);
      }
      unmatchedCheckIns.get(event.workerId)!.push({ event, workDate, sessionIndex });
      
    } else if (event.eventType === 'check_out') {
      // Find most recent unmatched check_in for this worker
      const workerUnmatched = unmatchedCheckIns.get(event.workerId);
      
      if (workerUnmatched && workerUnmatched.length > 0) {
        // Pop the most recent unmatched check_in
        const matched = workerUnmatched.pop()!;
        const workDate = matched.workDate;
        
        if (!result[workDate]) result[workDate] = {};
        if (!result[workDate][event.workerId]) {
          result[workDate][event.workerId] = { events: [], sessions: [] };
        }

        // ✅ إغلاق الجلسة المفتوحة
        result[workDate][event.workerId].sessions[matched.sessionIndex].checkOut = event;

        // ✅ checkOut = آخر خروج (للتوافق مع الكود القديم)
        result[workDate][event.workerId].checkOut = event;

        result[workDate][event.workerId].events.push(event);
      } else {
        // Orphan check_out: use its own calendar date
        const workDate = eventDate;
        if (!result[workDate]) result[workDate] = {};
        if (!result[workDate][event.workerId]) {
          result[workDate][event.workerId] = { events: [], sessions: [] };
        }

        // ✅ جلسة يتيمة بدون دخول
        result[workDate][event.workerId].sessions.push({ checkOut: event });

        result[workDate][event.workerId].checkOut = event;
        result[workDate][event.workerId].events.push(event);
      }
    }
  }
  
return result;
}
/**
 * Get the work date for a check_out event by finding its matching check_in.
 * Returns the check_in's calendar date, or the check_out's date if no match found.
 */
export async function getWorkDateForCheckOut(workerId: number, checkOutTime: Date): Promise<string> {
  const db = await getDb();
  if (!db) return getAdministrativeWorkDate(checkOutTime);
  
  const { attendanceEvents } = await import('../../drizzle/schema');
  
  // Look back up to 24 hours for a matching check_in
  const lookbackTime = new Date(checkOutTime.getTime() - 24 * 60 * 60 * 1000);
  
  const checkInEvents = await db
    .select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workerId, workerId),
        eq(attendanceEvents.eventType, 'check_in'),
        gte(attendanceEvents.eventTime, lookbackTime),
        lte(attendanceEvents.eventTime, checkOutTime)
      )
    )
    .orderBy(desc(attendanceEvents.eventTime))
    .limit(1);
  
  if (checkInEvents.length > 0) {
    return getAdministrativeWorkDate(new Date(checkInEvents[0].eventTime));
  }
  
  // No matching check_in found, use check_out's date
  return getAdministrativeWorkDate(checkOutTime);
}
/**
 * Expand date range to include next-day check_outs for night shifts.
 * For a given date range, extends the end time to 10:00 AM the next day
 * to capture check_outs from night shifts that started on the last day.
 */
export function getExpandedDateRange(dateStr: string): { startOfDay: Date; endOfSearch: Date } {
  // Use UTC explicitly to avoid timezone issues
  const startOfDay = new Date(dateStr + 'T00:00:00Z');
  // Expand backwards: previous day at 00:00 UTC to capture check_ins from previous evening shifts
  // This ensures groupEventsByWorkDate can find the matching check_in for orphan check_outs
  // (e.g., check_in at 3 PM UTC = 6 PM local on prev day)
  const expandedStart = new Date(startOfDay);
  expandedStart.setTime(expandedStart.getTime() - 24 * 60 * 60 * 1000); // Go back 24 hours
  // Extend forward to 10 AM UTC next day to capture night shift check_outs
  const endOfSearch = new Date(startOfDay);
  endOfSearch.setTime(endOfSearch.getTime() + 34 * 60 * 60 * 1000); // +34 hours = next day 10 AM
  return { startOfDay: expandedStart, endOfSearch };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Configure connection pool with limits to prevent resource exhaustion
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          connectionLimit: 5,        // Max 5 concurrent connections
          waitForConnections: true,  // Wait if all connections are busy
          queueLimit: 10,            // Max 10 queued requests
          idleTimeout: 60000,        // Close idle connections after 60s
          enableKeepAlive: true,     // Keep connections alive
          keepAliveInitialDelay: 30000, // First keepalive after 30s
        }
      });
      console.log('[Database] Connection pool initialized (limit: 5, idle timeout: 60s)');
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Get raw MySQL connection for direct queries
export async function getRawConnection() {
  if (!_rawConnection && process.env.DATABASE_URL) {
    try {
      const mysql = await import('mysql2/promise');
      _rawConnection = await mysql.createConnection(process.env.DATABASE_URL);
      console.log('[Database] Raw connection established');
    } catch (error) {
      console.warn("[Database] Failed to create raw connection:", error);
      _rawConnection = null;
    }
  }
  return _rawConnection;
}

