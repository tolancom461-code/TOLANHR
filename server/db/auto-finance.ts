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
import { getDb, getExpandedDateRange, groupEventsByWorkDate } from './connection';
import { transformGroup } from './groups';
import { recordAttendance } from './attendance';

import { aggregatePayrollData } from './advanced-payroll';
import { calculateAssignmentDays, getAssignmentsFromCostCenter, getAssignmentsToCostCenter } from './temporary-assignments';

// ============================================
// Auto Finance Calculation
// ============================================

/**
 * حساب وحفظ المالية اليومية تلقائياً عند check_out
 * يتم استدعاء هذه الدالة من recordAttendance
 */
export async function calculateAndSaveDailyFinance(workerId: number, checkOutTime: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers, groups, attendanceEvents, workerDailyFinance } = await import('../../drizzle/schema');
  
  // Get check_in time - look back up to 24 hours to support night shifts
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
  
  if (checkInEvents.length === 0) {
    return;
  }
  
  const checkInTime = checkInEvents[0].eventTime;
  
  // Work date = check_in's calendar date (NOT check_out's date)
  // This correctly handles night shifts where check_out crosses midnight
  const workDate = new Date(checkInTime);
  workDate.setHours(0, 0, 0, 0);
  
  // Get worker and group data
  const [workerData] = await db
    .select({
      dailyRate: workers.dailyRate,
      groupId: workers.groupId,
      workMinutes: groups.workMinutes,
      minuteCost: groups.minuteCost,
      latePenaltyRate: groups.latePenaltyRate,
      earlyLeavePenaltyRate: groups.earlyLeavePenaltyRate,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(workers.id, workerId))
    .limit(1);
  
  if (!workerData) {
    throw new Error("Worker not found");
  }
  
  const dailyRate = Number(workerData.dailyRate) || 0;
  const minuteCost = Number(workerData.minuteCost) || 0;
  const latePenaltyRate = Number(workerData.latePenaltyRate) || 0;
  const earlyLeavePenaltyRate = Number(workerData.earlyLeavePenaltyRate) || 0;
  
  // Get shift times from weekly schedule based on day of week
  let shiftStartTime: string | null = null;
  let shiftEndTime: string | null = null;
  
  if (workerData.groupId) {
    const dayOfWeek = workDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday (local time)
    const workDateStr = typeof workDate === 'string' ? workDate : workDate.toLocaleDateString('en-CA');
    
    const [schedule] = await db
      .select()
      .from(groupSchedules)
      .where(
        and(
          eq(groupSchedules.groupId, workerData.groupId),
          eq(groupSchedules.dayOfWeek, dayOfWeek),
          eq(groupSchedules.isActive, true),
          or(
            isNull(groupSchedules.effectiveDate),
            sql`${groupSchedules.effectiveDate} <= ${workDateStr}`
          )
        )
      )
      .orderBy(desc(groupSchedules.effectiveDate))
      .limit(1);
    
    if (schedule) {
      shiftStartTime = schedule.startTime;
      shiftEndTime = schedule.endTime;
    }
  }
  
  // Get group daily wage
  const groupData = workerData.groupId ? await db.select().from(groups).where(eq(groups.id, workerData.groupId)).limit(1) : [];
  const groupDailyWage = groupData.length > 0 && groupData[0].dailyWage ? Number(groupData[0].dailyWage) : 0;
  const groupWorkMinutes = groupData.length > 0 && groupData[0].workMinutes ? Number(groupData[0].workMinutes) : 0;
  
  // Base salary = fixed daily wage (not calculated from minutes)
  let baseSalary = groupDailyWage > 0 ? groupDailyWage : dailyRate;
  let latePenalty = 0;
  let earlyLeavePenalty = 0;
  let workedMinutes = Math.floor((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
  // Cap worked minutes at shift duration
  let financialMinutes = groupWorkMinutes > 0 ? Math.min(workedMinutes, groupWorkMinutes) : workedMinutes;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  
  // ⚠️ SHIFT-BASED CALCULATIONS: Only if shift is defined in group_schedules
  // If no shift is defined, NO penalties are calculated (worker gets full daily wage)
  if (shiftStartTime && shiftEndTime) {
    // Parse shift times
    const [shiftStartHour, shiftStartMin] = shiftStartTime.split(':').map(Number);
    const [shiftEndHour, shiftEndMin] = shiftEndTime.split(':').map(Number);
    
    // Build shift times in local time to match stored event times
    const shiftDateBase = new Date(workDate.toLocaleDateString('en-CA') + 'T00:00:00');
    const shiftStart = new Date(shiftDateBase);
    shiftStart.setHours(shiftStartHour, shiftStartMin, 0, 0);
    
    let shiftEnd = new Date(shiftDateBase);
    shiftEnd.setHours(shiftEndHour, shiftEndMin, 0, 0);
    
    // If shift ends after midnight
    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }
    
    // Calculate actual work time within shift boundaries
    const actualStart = checkInTime > shiftStart ? checkInTime : shiftStart;
    const actualEnd = checkOutTime < shiftEnd ? checkOutTime : shiftEnd;
    
    if (actualEnd > actualStart) {
      financialMinutes = Math.floor((actualEnd.getTime() - actualStart.getTime()) / 60000);
      // Cap at shift duration
      if (groupWorkMinutes > 0) {
        financialMinutes = Math.min(financialMinutes, groupWorkMinutes);
      }
    } else {
      financialMinutes = 0;
    }
    
    // Calculate late minutes: only if checked in AFTER shift start
    if (checkInTime > shiftStart) {
      lateMinutes = Math.floor((checkInTime.getTime() - shiftStart.getTime()) / 60000);
    }
    
    // Calculate early leave minutes: only if checked out BEFORE shift end
    if (checkOutTime < shiftEnd) {
      earlyLeaveMinutes = Math.floor((shiftEnd.getTime() - checkOutTime.getTime()) / 60000);
    }
    
    // Calculate penalties using minuteCost
    // penaltyRate is stored as percentage (e.g., 200% = double the minute cost)
    if (latePenaltyRate > 0 && lateMinutes > 0 && minuteCost > 0) {
      latePenalty = lateMinutes * minuteCost * (latePenaltyRate / 100);
    }
    
    if (earlyLeavePenaltyRate > 0 && earlyLeaveMinutes > 0 && minuteCost > 0) {
      earlyLeavePenalty = earlyLeaveMinutes * minuteCost * (earlyLeavePenaltyRate / 100);
    }
  }
  // else: No shift defined = no penalties, worker gets full daily wage
  
  // ⚠️ CAP: Total deductions cannot exceed base salary (net >= 0)
  let totalDeductions = latePenalty + earlyLeavePenalty;
  if (totalDeductions > baseSalary) {
    // Scale down penalties proportionally to cap at baseSalary
    const scale = baseSalary / totalDeductions;
    latePenalty = Math.round(latePenalty * scale * 100) / 100;
    earlyLeavePenalty = Math.round(earlyLeavePenalty * scale * 100) / 100;
    totalDeductions = baseSalary;
  }
  
  const netSalary = baseSalary - totalDeductions;
  
  // Save to worker_daily_finance
  // Check if record exists
  const existing = await db
    .select()
    .from(workerDailyFinance)
    .where(
      and(
        eq(workerDailyFinance.workerId, workerId),
        eq(workerDailyFinance.workDate, workDate)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing record
    await db
      .update(workerDailyFinance)
      .set({
        checkOutTime,
        workedMinutes,
        financialMinutes,
        lateMinutes,
        earlyLeaveMinutes,
        baseSalary: baseSalary.toString(),
        latePenalty: latePenalty.toString(),
        earlyLeavePenalty: earlyLeavePenalty.toString(),
        netSalary: netSalary.toString(),
        // New columns
        baseAmount: baseSalary.toString(),
        deductions: totalDeductions.toString(),
        bonuses: '0.00',
        netAmount: netSalary.toString(),
        updatedAt: new Date(),
      })
      .where(eq(workerDailyFinance.id, existing[0].id));
  } else {
    // Insert new record
    await db.insert(workerDailyFinance).values({
      workerId,
      workDate,
      checkInTime,
      checkOutTime,
      workedMinutes,
      financialMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      baseSalary: baseSalary.toString(),
      latePenalty: latePenalty.toString(),
      earlyLeavePenalty: earlyLeavePenalty.toString(),
      netSalary: netSalary.toString(),
      // New columns
      baseAmount: baseSalary.toString(),
      deductions: totalDeductions.toString(),
      bonuses: '0.00',
      netAmount: netSalary.toString(),
    });
  }
  
}


export async function saveWeeklySchedules(
  groupId: number,
  schedules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    requiredHours: number;
    isActive: boolean;
    dailyRate?: string; // ✅ المبلغ اليومي المخصص (اختياري)
  }>,
  effectiveDate?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { groupSchedules } = await import('../../drizzle/schema');

  // Delete existing schedules for this group
  await db.delete(groupSchedules).where(eq(groupSchedules.groupId, groupId));

  // Insert new schedules
  for (const schedule of schedules) {
    await db.insert(groupSchedules).values({
      groupId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      requiredHours: schedule.requiredHours.toString(),
      isActive: schedule.isActive,
      // ✅ حفظ المبلغ اليومي المخصص (NULL إذا لم يتم تحديده)
      dailyRate: schedule.dailyRate || null,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
    });
  }

  return { success: true, count: schedules.length };
}

/**
 * Aggregate payroll data for all workers in a cost center for a period
 */
export async function aggregatePayrollDataByCostCenter(
  costCenterId: number,
  periodStart: string,
  periodEnd: string,
  selectedGroupIds?: number[]  // ✅ المجموعات المختارة — إذا لم تُحدد يتم جلب الكل
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workers, groups } = await import('../../drizzle/schema');

  // First, get all groups in this cost center
  const groupsInCostCenter = await db
    .select()
    .from(groups)
    .where(eq(groups.costCenterId, costCenterId));

  // ✅ إذا تم تحديد مجموعات معينة → نفلتر، وإلا نأخذ الكل
  const targetGroupIds = selectedGroupIds && selectedGroupIds.length > 0
    ? groupsInCostCenter.filter(g => selectedGroupIds.includes(g.id)).map(g => g.id)
    : groupsInCostCenter.map(g => g.id);

  // Then, get all workers in these groups
  const groupIds = targetGroupIds;
  const workersInCostCenter = groupIds.length > 0
    ? await db.select().from(workers).where(inArray(workers.groupId, groupIds))
    : [];

  // === الانتدابات المؤقتة ===
  // 1. جلب الانتدابات الخارجة من هذا المركز (عمال انتدبوا لمراكز أخرى)
  const outgoingAssignments = await getAssignmentsFromCostCenter(costCenterId, periodStart, periodEnd);
  // 2. جلب الانتدابات الواردة إلى هذا المركز (عمال من مراكز أخرى)
  const incomingAssignments = await getAssignmentsToCostCenter(costCenterId, periodStart, periodEnd);

  // بناء خريطة أيام الانتداب الخارجي لكل عامل أصلي
  const outgoingDaysMap = new Map<number, number>(); // workerId -> total outgoing days
  for (const assignment of outgoingAssignments) {
    const days = calculateAssignmentDays(
      assignment.startDate, assignment.endDate, periodStart, periodEnd
    );
    outgoingDaysMap.set(
      assignment.workerId,
      (outgoingDaysMap.get(assignment.workerId) || 0) + days
    );
  }

  // Aggregate data for each original worker (minus outgoing assignment days)
  const results = [];
  for (const worker of workersInCostCenter) {
    const workerData = await aggregatePayrollData(worker.id, periodStart, periodEnd);
    const outgoingDays = outgoingDaysMap.get(worker.id) || 0;

    if (workerData.daysWorked > 0) {
      if (outgoingDays > 0 && workerData.daysWorked > outgoingDays) {
        // خصم أيام الانتداب الخارجي - حساب نسبي
        const originalDays = workerData.daysWorked;
        const remainingDays = originalDays - outgoingDays;
        const ratio = remainingDays / originalDays;

        const adjBaseAmount = (parseFloat(workerData.baseAmount) * ratio).toFixed(2);
        const adjDeductions = (parseFloat(workerData.deductionsTotal) * ratio).toFixed(2);
        const adjBonuses = (parseFloat(workerData.bonuses) * ratio).toFixed(2);
        const adjNet = (parseFloat(adjBaseAmount) - parseFloat(adjDeductions) + parseFloat(adjBonuses)).toFixed(2);

        results.push({
          workerId: worker.id,
          workerName: worker.fullName,
          baseAmount: adjBaseAmount,
          deductions: adjDeductions,
          bonuses: adjBonuses,
          netAmount: adjNet,
          daysWorked: remainingDays,
          isPartial: true,
          outgoingDays,
          notes: `منتدب ${outgoingDays} يوم لمركز آخر`,
        });
      } else if (outgoingDays >= workerData.daysWorked) {
        // كل أيامه منتدبة - لا يظهر في هذه الدفعة
        continue;
      } else {
        results.push({
          workerId: worker.id,
          workerName: worker.fullName,
          baseAmount: workerData.baseAmount,
          deductions: workerData.deductionsTotal,
          bonuses: workerData.bonuses,
          netAmount: workerData.netAmount,
          daysWorked: workerData.daysWorked,
        });
      }
    }
  }

  // 3. إضافة العمال المنتدبين إلى هذا المركز (من مراكز أخرى)
  for (const assignment of incomingAssignments) {
    const assignmentDays = calculateAssignmentDays(
      assignment.startDate, assignment.endDate, periodStart, periodEnd
    );

    if (assignmentDays <= 0) continue;

    // حساب المبلغ اليومي للعامل المنتدب
    const workerData = await aggregatePayrollData(assignment.workerId, periodStart, periodEnd);
    if (workerData.daysWorked <= 0) continue;

    const dailyRate = parseFloat(workerData.baseAmount) / workerData.daysWorked;
    const dailyDeduction = parseFloat(workerData.deductionsTotal) / workerData.daysWorked;
    const dailyBonus = parseFloat(workerData.bonuses) / workerData.daysWorked;

    const assignBaseAmount = (dailyRate * assignmentDays).toFixed(2);
    const assignDeductions = (dailyDeduction * assignmentDays).toFixed(2);
    const assignBonuses = (dailyBonus * assignmentDays).toFixed(2);
    const assignNet = (parseFloat(assignBaseAmount) - parseFloat(assignDeductions) + parseFloat(assignBonuses)).toFixed(2);

    // تحقق من عدم تكرار العامل (إذا كان له أكثر من انتداب)
    const existingIdx = results.findIndex(r => r.workerId === assignment.workerId);
    if (existingIdx >= 0) {
      // دمج مع سجل موجود
      const existing = results[existingIdx];
      results[existingIdx] = {
        ...existing,
        baseAmount: (parseFloat(existing.baseAmount) + parseFloat(assignBaseAmount)).toFixed(2),
        deductions: (parseFloat(existing.deductions) + parseFloat(assignDeductions)).toFixed(2),
        bonuses: (parseFloat(existing.bonuses) + parseFloat(assignBonuses)).toFixed(2),
        netAmount: (parseFloat(existing.netAmount) + parseFloat(assignNet)).toFixed(2),
        daysWorked: existing.daysWorked + assignmentDays,
      };
    } else {
      results.push({
        workerId: assignment.workerId,
        workerName: assignment.workerName || 'غير معروف',
        baseAmount: assignBaseAmount,
        deductions: assignDeductions,
        bonuses: assignBonuses,
        netAmount: assignNet,
        daysWorked: assignmentDays,
        isAssigned: true,
        fromGroupName: assignment.groupName,
        notes: `منتدب من ${assignment.groupName || 'مجموعة أخرى'} - ${assignmentDays} يوم`,
      });
    }
  }

  return results;
}


// Get all check_out events for a specific date
export async function getCheckOutEventsByDate(date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { attendanceEvents } = await import('../../drizzle/schema');
  
  // ✅ قاعدة 5 صباحاً: اليوم الإداري يبدأ 5 صباحاً وينتهي 4:59 صباحاً اليوم التالي
  const startOfDay = new Date(`${date}T05:00:00+03:00`);
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toLocaleDateString('en-CA');
  const endOfDay = new Date(`${nextDayStr}T04:59:59+03:00`);
  
  return await db
    .select()
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.eventType, 'check_out'),
        gte(attendanceEvents.eventTime, startOfDay),
        lte(attendanceEvents.eventTime, endOfDay)
      )
    );
}

// Delete all worker daily finance records for a specific date
export async function deleteWorkerDailyFinanceByDate(date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  await db
    .delete(workerDailyFinance)
    .where(eq(workerDailyFinance.workDate, new Date(date)));
}

// Get comprehensive audit log entries (all operations)
export async function getAuditLog(filters?: {
  startDate?: string;
  endDate?: string;
  action?: string;
  tableName?: string;
  userId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { auditLog, users } = await import('../../drizzle/schema');
  
  const conditions: any[] = [];
  
  if (filters?.startDate) {
    const startDate = new Date(filters.startDate);
    conditions.push(gte(auditLog.createdAt, startDate));
  }
  
  if (filters?.endDate) {
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLog.createdAt, endDate));
  }
  
  if (filters?.action) {
    conditions.push(eq(auditLog.action, filters.action));
  }
  
  if (filters?.tableName) {
    conditions.push(eq(auditLog.tableName, filters.tableName));
  }
  
  if (filters?.userId) {
    conditions.push(eq(auditLog.userId, filters.userId));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  // Get total count
  const [countResult] = await db
    .select({ value: count() })
    .from(auditLog)
    .where(whereClause);
  
  const total = countResult?.value || 0;
  
  // Get paginated results
  let query = db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      userName: users.fullName,
      userRole: users.role,
      action: auditLog.action,
      tableName: auditLog.tableName,
      recordId: auditLog.recordId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(filters?.limit || 50)
    .offset(filters?.offset || 0);
  
  const results = await query;
  
  // Parse JSON strings
  const logs = results.map(row => ({
    ...row,
    oldValues: row.oldValues ? (() => { try { return JSON.parse(row.oldValues as string); } catch { return row.oldValues; } })() : null,
    newValues: row.newValues ? (() => { try { return JSON.parse(row.newValues as string); } catch { return row.newValues; } })() : null,
  }));
  
  return { logs, total };
}

// Get audit log stats (counts by action type)
export async function getAuditLogStats(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions: any[] = [];
  
  if (filters?.startDate) {
    conditions.push(gte(auditLog.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLog.createdAt, endDate));
  }
  
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  
  const results = await db
    .select({
      action: auditLog.action,
      count: count(),
    })
    .from(auditLog)
    .where(whereClause)
    .groupBy(auditLog.action)
    .orderBy(desc(count()));
  
  return results;
}

/**
 * Check if a group has any active weekly schedules
 */
export async function checkGroupHasSchedules(groupId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const schedules = await db
    .select()
    .from(groupSchedules)
    .where(
      and(
        eq(groupSchedules.groupId, groupId),
        eq(groupSchedules.isActive, true)
      )
    )
    .limit(1);
  
  return schedules.length > 0;
}

/**
 * Get all groups without active weekly schedules
 */
export async function getGroupsWithoutSchedules() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  // Get all active groups
  const allGroups = await db
    .select()
    .from(groups)
    .where(eq(groups.isActive, true));
  
  // Check each group for schedules
  const groupsWithoutSchedules = [];
  for (const group of allGroups) {
    const hasSchedules = await checkGroupHasSchedules(group.id);
    if (!hasSchedules) {
      groupsWithoutSchedules.push(transformGroup(group));
    }
  }
  
  return groupsWithoutSchedules;
}


/**
 * Check if a schedule effective date conflicts with existing payroll batches
 * Returns the conflicting batch if found, null otherwise
 */
export async function checkScheduleDateConflict(
  groupId: number,
  effectiveDate: string
): Promise<{ batchCode: string; periodStart: string; periodEnd: string; status: string } | null> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const { payrollBatches, payrollBatchItems, workers } = await import('../../drizzle/schema');
  
  // Get all workers in this group
  const groupWorkers = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.groupId, groupId));
  
  if (groupWorkers.length === 0) {
    return null; // No workers in group, no conflict
  }
  
  const workerIds = groupWorkers.map(w => w.id);
  
  // Find payroll batches that:
  // 1. Include workers from this group
  // 2. Have a period that includes or overlaps with the effective date
  const batches = await db
    .select({
      batchCode: payrollBatches.batchCode,
      periodStart: payrollBatches.periodStart,
      periodEnd: payrollBatches.periodEnd,
      status: payrollBatches.status,
    })
    .from(payrollBatches)
    .innerJoin(
      payrollBatchItems,
      eq(payrollBatches.id, payrollBatchItems.batchId)
    )
    .where(
      and(
        sql`${payrollBatchItems.workerId} IN (${sql.join(workerIds.map(id => sql`${id}`), sql`, `)})`,
        sql`${payrollBatches.periodStart} <= ${effectiveDate}`,
        sql`${payrollBatches.periodEnd} >= ${effectiveDate}`
      )
    )
    .limit(1);
  
  if (batches.length > 0) {
    const batch = batches[0];
    return {
      batchCode: batch.batchCode,
      periodStart: batch.periodStart instanceof Date ? batch.periodStart.toLocaleDateString('en-CA') : batch.periodStart,
      periodEnd: batch.periodEnd instanceof Date ? batch.periodEnd.toLocaleDateString('en-CA') : batch.periodEnd,
      status: batch.status || 'draft'
    };
  }
  
  return null;
}

/**
 * Get the earliest safe effective date for a group (after all existing payroll batches)
 */
export async function getEarliestSafeEffectiveDate(groupId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const { payrollBatches, payrollBatchItems, workers } = await import('../../drizzle/schema');
  
  // Get all workers in this group
  const groupWorkers = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.groupId, groupId));
  
  if (groupWorkers.length === 0) {
    // No workers, today is safe
    return new Date().toLocaleDateString('en-CA');
  }
  
  const workerIds = groupWorkers.map(w => w.id);
  
  // Find the latest payroll batch end date for this group's workers
  const [latestBatch] = await db
    .select({
      periodEnd: payrollBatches.periodEnd,
    })
    .from(payrollBatches)
    .innerJoin(
      payrollBatchItems,
      eq(payrollBatches.id, payrollBatchItems.batchId)
    )
    .where(
      sql`${payrollBatchItems.workerId} IN (${sql.join(workerIds.map(id => sql`${id}`), sql`, `)})`
    )
    .orderBy(desc(payrollBatches.periodEnd))
    .limit(1);
  
  if (!latestBatch) {
    // No batches found, today is safe
    return new Date().toLocaleDateString('en-CA');
  }
  
  // Return the day after the latest batch end date
  const safeDate = new Date(latestBatch.periodEnd);
  safeDate.setDate(safeDate.getDate() + 1);
  return safeDate.toLocaleDateString('en-CA');
}


/**
 * Get groups with recent schedule changes (within last 24 hours)
 * Returns groups that had schedule modifications and might affect payroll calculation
 */
export async function getRecentScheduleChanges(hoursThreshold: number = 24): Promise<Array<{
  groupId: number;
  groupName: string;
  lastModified: Date;
  modifiedSchedules: number;
}>> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const { groupSchedules, groups } = await import('../../drizzle/schema');
  
  // Calculate the threshold timestamp
  const thresholdDate = new Date();
  thresholdDate.setHours(thresholdDate.getHours() - hoursThreshold);
  
  // Get all schedules modified after threshold, grouped by group
  const recentChanges = await db
    .select({
      groupId: groupSchedules.groupId,
      groupName: groups.name,
      lastModified: sql<Date>`MAX(${groupSchedules.updatedAt})`,
      modifiedSchedules: sql<number>`COUNT(DISTINCT ${groupSchedules.id})`,
    })
    .from(groupSchedules)
    .innerJoin(groups, eq(groupSchedules.groupId, groups.id))
    .where(
      sql`${groupSchedules.updatedAt} >= ${thresholdDate.toISOString().slice(0, 19).replace('T', ' ')}`
    )
    .groupBy(groupSchedules.groupId, groups.name);
  
  return recentChanges.map(change => ({
    groupId: change.groupId,
    groupName: change.groupName,
    lastModified: new Date(change.lastModified),
    modifiedSchedules: Number(change.modifiedSchedules),
  }));
}


/**
 * Get incomplete attendance records for a specific date
 * Returns records that have either check-in without check-out or check-out without check-in
 */
export async function getIncompleteAttendance(workDate: Date): Promise<Array<{
  workerId: number;
  workerCode: string;
  workerName: string;
  groupId: number | null;
  groupName: string;
  checkInId: number | null;
  checkInTime: Date | null;
  checkOutId: number | null;
  checkOutTime: Date | null;
  incompleteType: 'missing_check_out' | 'missing_check_in';
}>> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const { attendanceEvents, workers, groups } = await import('../../drizzle/schema');
  
  // Get date range for the work date - expanded for night shifts
  const dateStr = workDate.toLocaleDateString('en-CA');
  const { startOfDay, endOfSearch } = getExpandedDateRange(dateStr);
  
  // Get all attendance events for the expanded range
  const events = await db
    .select({
      id: attendanceEvents.id,
      workerId: attendanceEvents.workerId,
      eventType: attendanceEvents.eventType,
      eventTime: attendanceEvents.eventTime,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
      groupName: groups.name,
    })
    .from(attendanceEvents)
    .innerJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(
      and(
        gte(attendanceEvents.eventTime, startOfDay),
        lte(attendanceEvents.eventTime, endOfSearch)
      )
    )
    .orderBy(attendanceEvents.workerId, attendanceEvents.eventTime);
  
  // Use groupEventsByWorkDate for correct night shift handling
  const grouped = groupEventsByWorkDate(events);
  const dayData = grouped[dateStr] || {};
  
  // Find incomplete records using the correctly grouped data
  const incompleteRecords: Array<{
    workerId: number;
    workerCode: string;
    workerName: string;
    groupId: number | null;
    groupName: string;
    checkInId: number | null;
    checkInTime: Date | null;
    checkOutId: number | null;
    checkOutTime: Date | null;
    incompleteType: 'missing_check_out' | 'missing_check_in';
  }> = [];
  
  for (const [workerIdStr, wd] of Object.entries(dayData)) {
    const wId = Number(workerIdStr);
    const workerEvent = events.find(e => e.workerId === wId);
    if (!workerEvent) continue;
    
    const hasCheckIn = !!wd.checkIn;
    const hasCheckOut = !!wd.checkOut;
    
    if (hasCheckIn && !hasCheckOut) {
      // Has check-in but no check-out
      incompleteRecords.push({
        workerId: wId,
        workerCode: workerEvent.workerCode,
        workerName: workerEvent.workerName,
        groupId: workerEvent.groupId,
        groupName: workerEvent.groupName || 'N/A',
        checkInId: wd.checkIn.id,
        checkInTime: wd.checkIn.eventTime,
        checkOutId: null,
        checkOutTime: null,
        incompleteType: 'missing_check_out',
      });
    } else if (!hasCheckIn && hasCheckOut) {
      // Has check-out but no check-in (orphan check-out)
      incompleteRecords.push({
        workerId: wId,
        workerCode: workerEvent.workerCode,
        workerName: workerEvent.workerName,
        groupId: workerEvent.groupId,
        groupName: workerEvent.groupName || 'N/A',
        checkInId: null,
        checkInTime: null,
        checkOutId: wd.checkOut.id,
        checkOutTime: wd.checkOut.eventTime,
        incompleteType: 'missing_check_in',
      });
    }
    // Workers with both checkIn and checkOut are complete, skip
  }
  
  return incompleteRecords;
}

/**
 * Check if there are any incomplete attendance records for a date range
 * Used before creating payroll batches to ensure all attendance is complete
 */
export async function checkIncompleteAttendanceForPeriod(
  startDate: Date,
  endDate: Date
): Promise<{
  hasIncomplete: boolean;
  incompleteCount: number;
  incompleteRecords: Array<{
    date: string;
    workerCode: string;
    workerName: string;
    incompleteType: string;
  }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const incompleteRecords: Array<{
    date: string;
    workerCode: string;
    workerName: string;
    incompleteType: string;
  }> = [];
  
  // Check each date in the range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayIncomplete = await getIncompleteAttendance(currentDate);
    
    for (const record of dayIncomplete) {
      incompleteRecords.push({
        date: currentDate.toLocaleDateString('en-CA'),
        workerCode: record.workerCode,
        workerName: record.workerName,
        incompleteType: record.incompleteType === 'missing_check_out' 
          ? 'حضور بدون انصراف' 
          : 'انصراف بدون حضور',
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return {
    hasIncomplete: incompleteRecords.length > 0,
    incompleteCount: incompleteRecords.length,
    incompleteRecords,
  };
}

/**
 * Check if there are any incomplete attendance records for a date range and cost center
 * Used before creating payroll batches to ensure all attendance for the same period/cost center is complete
 */
export async function checkIncompleteAttendanceForPeriodAndCostCenter(
  startDate: Date,
  endDate: Date,
  costCenterId: number | null,
  groupIds?: number[] // ✅ إذا حُددت، يُقصر الفحص على هذه المجموعات فقط بدل كل مركز التكلفة
): Promise<{
  hasIncomplete: boolean;
  incompleteCount: number;
  incompleteRecords: Array<{
    date: string;
    workerCode: string;
    workerName: string;
    incompleteType: string;
  }>;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const incompleteRecords: Array<{
    date: string;
    workerCode: string;
    workerName: string;
    incompleteType: string;
  }> = [];
  
  // Check each date in the range
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayIncomplete = await getIncompleteAttendance(currentDate);
    
    for (const record of dayIncomplete) {
      // If costCenterId is specified, filter by workers in groups belonging to that cost center
      if (costCenterId) {
        // Get the worker's group to check cost center
        const { workers: workersTable, groups: groupsTable } = await import('../../drizzle/schema');
        const workerData = await db
          .select({ costCenterId: groupsTable.costCenterId, groupId: workersTable.groupId })
          .from(workersTable)
          .leftJoin(groupsTable, eq(workersTable.groupId, groupsTable.id))
          .where(eq(workersTable.id, record.workerId))
          .limit(1);
        
        if (workerData.length === 0 || workerData[0].costCenterId !== costCenterId) {
          continue; // Skip workers not in the specified cost center
        }

        // ✅ إذا حُددت مجموعات معينة، تخطَّ العمال الذين لا ينتمون لأي منها
        if (groupIds && groupIds.length > 0) {
          if (!workerData[0].groupId || !groupIds.includes(workerData[0].groupId)) {
            continue;
          }
        }
      }
      
      incompleteRecords.push({
        date: currentDate.toLocaleDateString('en-CA'),
        workerCode: record.workerCode,
        workerName: record.workerName,
        incompleteType: record.incompleteType === 'missing_check_out' 
          ? 'حضور بدون انصراف' 
          : 'انصراف بدون حضور',
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return {
    hasIncomplete: incompleteRecords.length > 0,
    incompleteCount: incompleteRecords.length,
    incompleteRecords,
  };
}

// دالة مؤقتة لإضافتها إلى server/db.ts
export async function getAbsentWorkers(workDate: Date, groupId?: number) {
  const db = await getDb();
  if (!db) return [];
  


  // Convert workDate to date string properly (workDate may be a Date object from tRPC)
  const dateStr = workDate instanceof Date 
    ? workDate.toLocaleDateString('en-CA') 
    : String(workDate).split('T')[0];
  // Use administrative work_date (5 AM boundary) instead of calendar date

  // Get all workers (optionally filtered by group)
  const workerConditions = [eq(workers.status, 'active')];
  if (groupId) {
    workerConditions.push(eq(workers.groupId, groupId));
  }
  
  const allWorkers = await db
    .select({
      workerId: workers.id,
      workerCode: workers.code,
      workerName: workers.fullName,
      groupId: workers.groupId,
      groupName: groups.name,
    })
    .from(workers)
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(and(...workerConditions));


  // Get workers who have check_in records for this administrative date
  const workersWithAttendance = await db
    .select({
      workerId: attendanceEvents.workerId,
    })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.workDate, sql`${dateStr}`),
        eq(attendanceEvents.eventType, 'check_in')
      )
    )
    .groupBy(attendanceEvents.workerId);

  const workerIdsWithAttendance = new Set(
    workersWithAttendance.map((w) => w.workerId)
  );


  // Filter out workers who have attendance
  const absentWorkers = allWorkers.filter(
    (worker) => !workerIdsWithAttendance.has(worker.workerId)
  );


  return absentWorkers;
}


