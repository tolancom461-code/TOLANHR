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
// Daily Finance Entries Functions
// ============================================

export async function listDailyFinanceEntries(input: {
  workerId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const { workers: workersTable } = await import('../../drizzle/schema');
    
    let conditions = [];
    
    if (input.workerId) {
      conditions.push(eq(workerDailyFinance.workerId, input.workerId));
    }
    
    if (input.startDate) {
      conditions.push(sql`${workerDailyFinance.workDate} >= ${input.startDate}`);
    }
    
    if (input.endDate) {
      conditions.push(sql`${workerDailyFinance.workDate} <= ${input.endDate}`);
    }
    
    let query = db
      .select({
        id: workerDailyFinance.id,
        workerId: workerDailyFinance.workerId,
        workerName: workersTable.fullName,
        workerCode: workersTable.code,
        workDate: workerDailyFinance.workDate,
        baseAmount: workerDailyFinance.baseAmount,
        deductions: workerDailyFinance.deductions,
        bonuses: workerDailyFinance.bonuses,
        netAmount: workerDailyFinance.netAmount,
        lateMinutes: workerDailyFinance.lateMinutes,
        earlyLeaveMinutes: workerDailyFinance.earlyLeaveMinutes,
        notes: workerDailyFinance.notes,
      })
      .from(workerDailyFinance)
      .leftJoin(workersTable, eq(workerDailyFinance.workerId, workersTable.id));
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const entries = await query;
    
    return entries.map(entry => ({
      id: entry.id,
      workerId: entry.workerId,
      workerName: entry.workerName || 'Unknown',
      workerCode: entry.workerCode || '',
      workDate: entry.workDate,
      baseAmount: entry.baseAmount,
      deductions: entry.deductions,
      bonuses: entry.bonuses,
      netAmount: entry.netAmount,
      lateMinutes: entry.lateMinutes,
      earlyLeaveMinutes: entry.earlyLeaveMinutes,
      notes: entry.notes || '',
    }));
  } catch (error) {
    console.error('[Database] Error listing daily finance entries:', error);
    return [];
  }
}

export async function createDailyFinanceEntry(input: {
  workerId: number;
  workDate: Date;
  baseAmount?: number;
  deductions?: number;
  bonuses?: number;
  notes?: string;
}): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    const netAmount = (input.baseAmount || 0) - (input.deductions || 0) + (input.bonuses || 0);
    
    const result = await db.insert(workerDailyFinance).values([{
      workerId: input.workerId,
      workDate: input.workDate,
      baseAmount: input.baseAmount?.toString() || '0.00',
      deductions: input.deductions?.toString() || '0.00',
      bonuses: input.bonuses?.toString() || '0.00',
      netAmount: netAmount.toString(),
      notes: input.notes,
    }]);

    return { success: true, id: (result as any).insertId || 0 };
  } catch (error) {
    console.error('[Database] Error creating daily finance entry:', error);
    throw error;
  }
}

export async function updateDailyFinanceEntry(
  id: number,
  data: {
    baseAmount?: number;
    deductions?: number;
    bonuses?: number;
    notes?: string;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    const updateData: any = {};
    if (data.baseAmount !== undefined) updateData.baseAmount = data.baseAmount;
    if (data.deductions !== undefined) updateData.deductions = data.deductions;
    if (data.bonuses !== undefined) updateData.bonuses = data.bonuses;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // Recalculate netAmount if any amount field changed
    if (data.baseAmount !== undefined || data.deductions !== undefined || data.bonuses !== undefined) {
      const entry = await db.select().from(workerDailyFinance).where(eq(workerDailyFinance.id, id)).limit(1);
      if (entry[0]) {
        const base = (data.baseAmount !== undefined ? data.baseAmount : (entry[0].baseAmount ? parseFloat(entry[0].baseAmount.toString()) : 0)) || 0;
        const deductions = (data.deductions !== undefined ? data.deductions : (entry[0].deductions ? parseFloat(entry[0].deductions.toString()) : 0)) || 0;
        const bonuses = (data.bonuses !== undefined ? data.bonuses : (entry[0].bonuses ? parseFloat(entry[0].bonuses.toString()) : 0)) || 0;
        updateData.netAmount = base - deductions + bonuses;
      }
    }

    await db.update(workerDailyFinance)
      .set(updateData)
      .where(eq(workerDailyFinance.id, id));

    return { success: true };
  } catch (error) {
    console.error('[Database] Error updating daily finance entry:', error);
    throw error;
  }
}

export async function deleteDailyFinanceEntry(id: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    await db.delete(workerDailyFinance)
      .where(eq(workerDailyFinance.id, id));

    return { success: true };
  } catch (error) {
    console.error('[Database] Error deleting daily finance entry:', error);
    throw error;
  }
}

/**
 * حذف سجل مالي يومي حسب workerId و workDate
 * مفيد للصيانة والتنظيف
 */
export async function deleteDailyFinanceByWorkerAndDate(
  workerId: number,
  workDate: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { workerDailyFinance } = await import('../../drizzle/schema');

  try {
    await db.delete(workerDailyFinance)
      .where(and(
        eq(workerDailyFinance.workerId, workerId),
        eq(workerDailyFinance.workDate, sql`${workDate}`)
      ));

    return { success: true };
  } catch (error) {
    console.error('[Database] Error deleting daily finance by worker and date:', error);
    throw error;
  }
}

/**
 * تنظيف السجلات المالية اليتيمة (بدون بصمات مقابلة)
 * يحذف جميع السجلات في worker_daily_finance التي لا يوجد لها بصمات في attendance_events
 */
export async function cleanupOrphanFinanceRecords(): Promise<{
  deletedCount: number;
  totalAmount: number;
  records: any[];
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { workerDailyFinance, attendanceEvents, workers } = await import('../../drizzle/schema');

  try {
    // الحصول على قائمة السجلات اليتيمة
    const orphanRecords = await db
      .select({
        id: workerDailyFinance.id,
        workerId: workerDailyFinance.workerId,
        workerCode: workers.code,
        workerName: workers.fullName,
        workDate: workerDailyFinance.workDate,
        baseAmount: workerDailyFinance.baseAmount,
        deductions: workerDailyFinance.deductions,
        netAmount: workerDailyFinance.netAmount,
      })
      .from(workerDailyFinance)
      .leftJoin(workers, eq(workerDailyFinance.workerId, workers.id))
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ${attendanceEvents}
          WHERE ${attendanceEvents.workerId} = ${workerDailyFinance.workerId}
          AND ${attendanceEvents.workDate} = ${workerDailyFinance.workDate}
        )`
      );

    if (orphanRecords.length === 0) {
      return { deletedCount: 0, totalAmount: 0, records: [] };
    }

    // حساب الإجمالي
    const totalAmount = orphanRecords.reduce((sum, record) => {
      return sum + parseFloat(record.netAmount?.toString() || '0');
    }, 0);

    // حذف السجلات اليتيمة
    const recordIds = orphanRecords.map(r => r.id);
    await db.delete(workerDailyFinance)
      .where(sql`${workerDailyFinance.id} IN (${sql.join(recordIds.map(id => sql`${id}`), sql`, `)})`)

    return {
      deletedCount: orphanRecords.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      records: orphanRecords,
    };
  } catch (error) {
    console.error('[Database] Error cleaning up orphan finance records:', error);
    throw error;
  }
}


