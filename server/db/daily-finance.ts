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
import { getDb, safeParseDecimal, safeParseInt } from './connection';
import { getEffectiveGroupForWorkerOnDate } from './recalculation';

// ============================================
// Daily Finance Functions (Phase 4 Completion)
// ============================================

export async function createOrUpdateDailyFinance(
  workerId: number, 
  workDate: string, 
  data: {
    baseAmount?: number;
    deductions?: number;
    bonuses?: number;
    lateMinutes?: number;
    earlyLeaveMinutes?: number;
    actualWorkMinutes?: number;
    checkInTime?: Date | null;
    checkOutTime?: Date | null;
    notes?: string;
    effectiveGroupId?: number | null; // ✅ المجموعة الفعالة (تراعي الانتدابات)
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { workerDailyFinance } = await import('../../drizzle/schema');
  
  // Check if exists
  const [existing] = await db
    .select()
    .from(workerDailyFinance)
    .where(and(
      eq(workerDailyFinance.workerId, workerId),
      eq(workerDailyFinance.workDate, sql`${workDate}`)
    ))
    .limit(1);
  
  const baseAmount = data.baseAmount || 0;
  const deductions = data.deductions || 0;
  const bonuses = data.bonuses || 0;
  const netAmount = baseAmount - deductions + bonuses;
  const workedMinutes = data.actualWorkMinutes || 0;
  // Financial minutes = worked minutes (already capped to shift boundaries)
  const financialMinutes = workedMinutes;
  
  if (existing) {
    await db.update(workerDailyFinance).set({
      baseAmount: sql`${baseAmount}`,
      deductions: sql`${deductions}`,
      bonuses: sql`${bonuses}`,
      netAmount: sql`${netAmount}`,
      baseSalary: sql`${baseAmount}`,
      netSalary: sql`${netAmount}`,
      workedMinutes: workedMinutes,
      financialMinutes: financialMinutes,
      lateMinutes: data.lateMinutes || 0,
      earlyLeaveMinutes: data.earlyLeaveMinutes || 0,
      latePenalty: sql`${deductions}`,
      checkInTime: data.checkInTime || existing.checkInTime,
      checkOutTime: data.checkOutTime || existing.checkOutTime,
      notes: data.notes,
      effectiveGroupId: data.effectiveGroupId ?? existing.effectiveGroupId, // ✅ حفظ المجموعة الفعالة
      updatedAt: new Date(),
    }).where(eq(workerDailyFinance.id, existing.id));
    return { id: existing.id, created: false };
  } else {
    const result = await db.insert(workerDailyFinance).values({
      workerId,
      workDate: sql`${workDate}`,
      baseAmount: sql`${baseAmount}`,
      deductions: sql`${deductions}`,
      bonuses: sql`${bonuses}`,
      netAmount: sql`${netAmount}`,
      baseSalary: sql`${baseAmount}`,
      netSalary: sql`${netAmount}`,
      workedMinutes: workedMinutes,
      financialMinutes: financialMinutes,
      lateMinutes: data.lateMinutes || 0,
      earlyLeaveMinutes: data.earlyLeaveMinutes || 0,
      latePenalty: sql`${deductions}`,
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
      notes: data.notes,
      effectiveGroupId: data.effectiveGroupId ?? null, // ✅ حفظ المجموعة الفعالة
    });
    return { id: (result as any).insertId, created: true };
  }
}

export async function calculateDailyFinanceFromAttendance(workerId: number, workDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { attendanceEvents, workers, groups, workDays, workerDailyFinance } = await import('../../drizzle/schema');
  
  // Get worker with group info
  const [worker] = await db.select().from(workers).where(eq(workers.id, workerId)).limit(1);
  if (!worker) throw new Error("العامل غير موجود");
  
  // ✅ Get effective group (considers temporary assignments)
  const effectiveGroupId = await getEffectiveGroupForWorkerOnDate(workerId, workDate);
  
  // Get group and shift info
  let dailyRate = safeParseDecimal(worker.dailyRate);
  
  // Group settings for minute-based calculations
  let groupDailyWage: number | null = null;
  let groupWorkMinutes: number | null = null;
  let groupLatePenaltyRate: number | null = null;
  let groupEarlyLeavePenaltyRate: number | null = null;
  let isFlexibleSchedule = false;
  let requiredHours: number | null = null;
  
  // ⚠️ CRITICAL: Shift times from group_schedules are the SOLE reference
  // If no shift is defined, NO penalties are calculated
  let shiftStartTime: string | null = null;
  let shiftEndTime: string | null = null;
  let hasShiftDefined = false;
  
  if (effectiveGroupId) {
    const [group] = await db.select().from(groups).where(eq(groups.id, effectiveGroupId)).limit(1);
    if (group) {
      if (group.dailyRate) {
        dailyRate = dailyRate || safeParseDecimal(group.dailyRate);
      }
      // Load group settings
      groupDailyWage = group.dailyWage ? safeParseDecimal(group.dailyWage) : null;
      groupWorkMinutes = safeParseInt(group.workMinutes);
      groupLatePenaltyRate = group.latePenaltyRate ? safeParseDecimal(group.latePenaltyRate) : null;
      groupEarlyLeavePenaltyRate = group.earlyLeavePenaltyRate ? safeParseDecimal(group.earlyLeavePenaltyRate) : null;
      isFlexibleSchedule = group.isFlexibleSchedule || false;
      requiredHours = group.requiredHours ? safeParseDecimal(group.requiredHours) : null;
      
      // Get shift times from weekly schedule based on day of week and effective date
      const workDateObj = typeof workDate === 'string' ? new Date(workDate + 'T00:00:00') : workDate;
      const dayOfWeek = workDateObj.getDay();
      const workDateStr = typeof workDate === 'string' ? workDate : workDateObj.toLocaleDateString('en-CA');
      
      const [schedule] = await db
        .select()
        .from(groupSchedules)
        .where(
          and(
            eq(groupSchedules.groupId, worker.groupId),
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
        hasShiftDefined = true;
        
        // ✅ المبلغ اليومي المخصص لهذا اليوم من جدول الورديات
        // إذا كان موجوداً وأكبر من 0، يتم استخدامه بدلاً من المبلغ الافتراضي للمجموعة
        // إذا كان NULL أو 0، يتم تجاهله واستخدام المنطق القديم كما هو
        const scheduleDailyRate = schedule.dailyRate ? safeParseDecimal(schedule.dailyRate) : null;
        if (scheduleDailyRate && scheduleDailyRate > 0) {
          groupDailyWage = scheduleDailyRate;
        }
      }
    }
  }
  
  // Check if it's a work day
  const [workDay] = await db.select().from(workDays).where(eq(workDays.workDate, sql`${workDate}`)).limit(1);
  if (workDay && (workDay.dayType === 'holiday' || workDay.dayType === 'weekend')) {
    return { baseAmount: 0, deductions: 0, bonuses: 0, lateMinutes: 0, earlyLeaveMinutes: 0, actualWorkMinutes: 0 };
  }
  
  // ✅ استخدام work_date بدلاً من event_time للتجميع
  // هذا يحل مشكلة الورديات الليلية بشكل تلقائي
  const allEvents = await db
    .select()
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.workerId, workerId),
      eq(attendanceEvents.workDate, sql`${workDate}`)
    ))
    .orderBy(attendanceEvents.eventTime);
  
// البحث عن أول حضور وآخر انصراف في هذا اليوم الإداري
  const checkIn = allEvents.find(e => e.eventType === 'check_in') || null;
  const checkOut = [...allEvents].reverse().find(e => e.eventType === 'check_out') || null;

  // ✅ حساب مجموع دقائق العمل الفعلية من كل الجلسات
  let totalActualMinutes = 0;
  const unmatchedIns: any[] = [];
  for (const event of allEvents) {
    if (event.eventType === 'check_in') {
      unmatchedIns.push(event);
    } else if (event.eventType === 'check_out' && unmatchedIns.length > 0) {
      const matchedIn = unmatchedIns.pop();
      const mins = Math.round(
        (new Date(event.eventTime).getTime() - new Date(matchedIn.eventTime).getTime()) / 60000
      );
      if (mins > 0) totalActualMinutes += mins;
    }
  }

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let actualWorkMinutes = 0;
  let baseAmount = 0;
  let deductions = 0;
  
  // If worker has both check-in and check-out
  if (checkIn && checkOut) {
    const checkInTime = new Date(checkIn.eventTime);
    const checkOutTime = new Date(checkOut.eventTime);
    
    // ✅ استخدام مجموع دقائق الجلسات بدلاً من الفارق بين أول دخول وآخر خروج
    const rawWorkMinutes = totalActualMinutes;
    
  // Base amount = fixed daily wage
  if (groupDailyWage && groupDailyWage > 0) {
    baseAmount = groupDailyWage;
    } else if (dailyRate > 0) {
      baseAmount = dailyRate;
    }
    
    // ⚠️ FLEXIBLE SCHEDULE: Hours-based calculation (no shift times needed)
    if (isFlexibleSchedule && requiredHours && requiredHours > 0) {
      // Calculate total work hours
      const totalWorkHours = rawWorkMinutes / 60;
      
      // No late or early leave penalties for flexible schedules
      lateMinutes = 0;
      earlyLeaveMinutes = 0;
      
      // If worker completed required hours → full daily wage
      if (totalWorkHours >= requiredHours) {
        actualWorkMinutes = requiredHours * 60; // Cap at required hours
        // No deductions - full wage
        deductions = 0;
      } else {
        // If less than required hours → deduct the difference
        actualWorkMinutes = rawWorkMinutes;
        const requiredMinutes = requiredHours * 60;
        const missingMinutes = requiredMinutes - rawWorkMinutes;
        
        if (groupDailyWage && requiredHours > 0) {
          // Calculate minute rate (more accurate than hourly rate)
          const minuteRate = groupDailyWage / requiredMinutes;
          // Deduct missing minutes with penalty rate
          const penaltyRate = groupEarlyLeavePenaltyRate ? groupEarlyLeavePenaltyRate / 100 : 1;
          deductions = minuteRate * missingMinutes * penaltyRate;
        }
      }
    }
    // ⚠️ SHIFT-BASED CALCULATIONS: Only if shift is defined in group_schedules
    else if (hasShiftDefined && shiftStartTime && shiftEndTime) {
      const [shiftStartHour, shiftStartMin] = shiftStartTime.split(':').map(Number);
      const [shiftEndHour, shiftEndMin] = shiftEndTime.split(':').map(Number);
      
      // Build shift times using the WORK DATE in local time
      const shiftDateBase = new Date(workDate + 'T00:00:00');
      const shiftStart = new Date(shiftDateBase);
      shiftStart.setHours(shiftStartHour, shiftStartMin, 0, 0);
      
      let shiftEnd = new Date(shiftDateBase);
      shiftEnd.setHours(shiftEndHour, shiftEndMin, 0, 0);
      
      // Handle night shifts: if shift end <= shift start, it crosses midnight
      if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
      
      // Financial check-in: capped to shift start (early arrival not counted)
      const financialCheckIn = checkInTime < shiftStart ? shiftStart : checkInTime;
      // Financial check-out: capped to shift end (late departure not counted)
      const financialCheckOut = checkOutTime > shiftEnd ? shiftEnd : checkOutTime;
      
      // Financial work minutes (within shift boundaries)
      if (financialCheckOut > financialCheckIn) {
        const financialMinutes = Math.round((financialCheckOut.getTime() - financialCheckIn.getTime()) / (1000 * 60));
        actualWorkMinutes = groupWorkMinutes && groupWorkMinutes > 0 
          ? Math.min(financialMinutes, groupWorkMinutes) 
          : financialMinutes;
      } else {
        // Worker left before shift started or arrived after shift ended
        actualWorkMinutes = 0;
      }
      
      // Late minutes: only if checked in AFTER shift start
      if (checkInTime > shiftStart) {
        lateMinutes = Math.round((checkInTime.getTime() - shiftStart.getTime()) / (1000 * 60));
      }
      
      // Early leave minutes: only if checked out BEFORE shift end
      if (checkOutTime < shiftEnd) {
        earlyLeaveMinutes = Math.round((shiftEnd.getTime() - checkOutTime.getTime()) / (1000 * 60));
      }
      
      // Calculate deductions using penalty rates
      if (groupDailyWage && groupWorkMinutes && groupWorkMinutes > 0) {
        const minuteCost = groupDailyWage / groupWorkMinutes;
        
        if (lateMinutes > 0 && groupLatePenaltyRate) {
          // إعفاء أول 4 دقائق — إذا تجاوز الـ 4 يُخصم كامل الدقائق
          if (lateMinutes > 4) {
          deductions += minuteCost * lateMinutes * (groupLatePenaltyRate / 100);
          }
        }
        if (earlyLeaveMinutes > 0 && groupEarlyLeavePenaltyRate) {
          deductions += minuteCost * earlyLeaveMinutes * (groupEarlyLeavePenaltyRate / 100);
        }
      }
    } else {
      // ❌ NO SHIFT DEFINED: No penalties calculated
      // Worker gets full daily wage, no late/early deductions
      // Work minutes = raw work minutes capped at groupWorkMinutes
      if (groupWorkMinutes && groupWorkMinutes > 0) {
        actualWorkMinutes = Math.min(rawWorkMinutes, groupWorkMinutes);
      } else {
        actualWorkMinutes = rawWorkMinutes;
      }
    }
    
    // Round deductions to nearest whole riyal (49 halala or less → down, 50+ → up)
    deductions = Math.round(deductions);
    
    // ⚠️ CAP: Deductions cannot exceed base amount (net >= 0)
    if (deductions > baseAmount) {
      deductions = baseAmount;
    }
    
    // Round base amount
    baseAmount = Math.round(baseAmount * 100) / 100;
    
  } else if (!checkIn && !checkOut) {
    // Absent: no base amount
    baseAmount = 0;
    actualWorkMinutes = 0;
  } else if (checkIn && !checkOut) {
    // ✅ Has check-in but no check-out yet → Worker is present, give full daily wage
    if (groupDailyWage && groupDailyWage > 0) {
      baseAmount = groupDailyWage;
    } else if (dailyRate > 0) {
      baseAmount = dailyRate;
    }
    // No penalties can be calculated without check-out time
    actualWorkMinutes = 0;
    lateMinutes = 0;
    earlyLeaveMinutes = 0;
    deductions = 0;
  } else {
    // Only check-out without check-in (unusual case)
    baseAmount = 0;
    actualWorkMinutes = 0;
  }
  
  return {
    baseAmount,
    deductions,
    bonuses: 0,
    lateMinutes,
    earlyLeaveMinutes,
    actualWorkMinutes,
    effectiveGroupId, // ✅ المجموعة الفعالة (تراعي الانتدابات)
  };
}

export async function processAttendanceToFinance(workerId: number, workDate: string) {
  const financeData = await calculateDailyFinanceFromAttendance(workerId, workDate);
  
  // Get check-in and check-out times for the record using work_date field
  const db = await getDb();
  let checkInTime: Date | null = null;
  let checkOutTime: Date | null = null;
  if (db) {
    const { attendanceEvents } = await import('../../drizzle/schema');
    
    // ✅ استخدام work_date بدلاً من event_time للتجميع
    const events = await db.select().from(attendanceEvents)
      .where(and(
        eq(attendanceEvents.workerId, workerId),
        eq(attendanceEvents.workDate, sql`${workDate}`)
      ))
      .orderBy(attendanceEvents.eventTime);
    
    // البحث عن أول حضور وآخر انصراف في هذا اليوم الإداري
    const checkInEvent = events.find(e => e.eventType === 'check_in');
    const checkOutEvent = events.reverse().find(e => e.eventType === 'check_out');
    
    if (checkInEvent) checkInTime = new Date(checkInEvent.eventTime);
    if (checkOutEvent) checkOutTime = new Date(checkOutEvent.eventTime);
  }
  
  return await createOrUpdateDailyFinance(workerId, workDate, {
    ...financeData,
    checkInTime,
    checkOutTime,
    effectiveGroupId: financeData.effectiveGroupId, // ✅ تمرير المجموعة الفعالة لحفظها في السجل المالي
  });
}

