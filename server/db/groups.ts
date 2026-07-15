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
import { calculateMinuteCost } from './work-group-settings';
import { recalculateGroupFinanceForOpenPeriods } from './recalculation';

// ============================================
// Groups Functions
// ============================================



// Helper function to transform Group from database format to API format
export function transformGroup(group: any): any {
  if (!group) return group;
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    costCenterId: group.costCenterId,
    supervisorId: group.supervisorId,
    dailyRate: group.dailyRate,
    dailyWage: group.dailyWage,
    workMinutes: group.workMinutes,
    minuteCost: group.minuteCost,
    latePenaltyRate: group.latePenaltyRate,
    earlyLeavePenaltyRate: group.earlyLeavePenaltyRate,
    isFlexibleSchedule: group.isFlexibleSchedule,
    requiredHours: group.requiredHours,
    isActive: group.isActive,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export async function getAllGroups(): Promise<Group[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(groups).orderBy(desc(groups.createdAt));
  return result.map(transformGroup);
}

export async function getGroupById(id: number): Promise<Group | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return result.length > 0 ? transformGroup(result[0]) : undefined;
}

// التحقق من وجود كود المجموعة مسبقاً
export async function getGroupByCode(code: string): Promise<Group | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(groups).where(eq(groups.code, code)).limit(1);
  return result.length > 0 ? transformGroup(result[0]) : null;
}

export async function createGroup(group: InsertGroup): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // التحقق من وجود الكود مسبقاً
  const existingGroup = await getGroupByCode(group.code);
  if (existingGroup) {
    throw new Error(`الكود "${group.code}" مسجل مسبقاً للمجموعة "${existingGroup.name}"`);
  }

  const result = await db.insert(groups).values(group);
  return result[0].insertId;
}

export async function updateGroup(id: number, data: Partial<InsertGroup>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate minute cost if dailyWage or workMinutes are provided
  const updatedData = { ...data };
  if (data.dailyWage !== undefined || data.workMinutes !== undefined) {
    // Get current values if not provided
    const current = await getGroupById(id);
    const dailyWage = data.dailyWage !== undefined ? data.dailyWage : current?.dailyWage;
    const workMinutes = data.workMinutes !== undefined ? data.workMinutes : current?.workMinutes;
    
    // Calculate minute cost
    const minuteCost = calculateMinuteCost(
      dailyWage ? Number(dailyWage) : null,
      workMinutes ? Number(workMinutes) : null
    );
    updatedData.minuteCost = minuteCost !== null ? minuteCost.toString() : null;
  }

  await db.update(groups).set({ ...updatedData, updatedAt: new Date() }).where(eq(groups.id, id));

  // ✅ إعادة الحساب تلقائيًا فقط لو تغيّر حقل فعليًا يؤثر على حساب الرواتب/الاستحقاقات
  // (تعديل الاسم، الكود، الحالة النشطة، مركز التكلفة... لا تحتاج إعادة حساب، وهذا يوفّر وقت الحفظ كثيرًا)
  const FINANCE_AFFECTING_FIELDS = [
    'dailyRate',
    'dailyWage',
    'workMinutes',
    'latePenaltyRate',
    'earlyLeavePenaltyRate',
    'isFlexibleSchedule',
    'requiredHours',
  ] as const;
  const changedFinanceFields = FINANCE_AFFECTING_FIELDS.filter((f) => (data as any)[f] !== undefined);

  if (changedFinanceFields.length > 0) {
    // ⚠️ مهم: ما ننتظر (await) إعادة الحساب هنا — بيانات المجموعة فوق خُزّنت فعلاً بالسطر السابق.
    // لو انتظرنا هنا، المستخدم بيضل شايف "جاري الحفظ..." لين تخلص إعادة الحساب (ثواني لدقائق حسب عدد العمال/الأيام)
    // مع إن الحفظ الفعلي خلص من زمان. نشغّلها بالخلفية بدون ما نعطّل رجوع الاستجابة للمستخدم.
    recalculateGroupFinanceForOpenPeriods(id)
      .then(() => {
        console.log(`[Group Updated] ✅ Recalculated all workers in group ${id} (changed: ${changedFinanceFields.join(', ')})`);
      })
      .catch((error: any) => {
        console.error(`[Group Updated] ⚠️ Recalc failed for group ${id}:`, error.message);
      });
  } else {
    console.log(`[Group Updated] ⏭️ Skipped recalculation for group ${id} (no finance-affecting fields changed)`);
  }
}

export async function getGroupsByCostCenter(costCenterId: number): Promise<Group[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.select().from(groups)
    .where(eq(groups.costCenterId, costCenterId))
    .orderBy(desc(groups.createdAt));
  return result.map(transformGroup);
}

export async function deleteGroup(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1️⃣ التحقق من وجود عمال مرتبطين بالمجموعة
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(workers)
    .where(eq(workers.groupId, id));

  // 2️⃣ التأكد من أن قيمة العدد رقمية دائماً
  const workersCount = Number(result[0]?.count ?? 0);

  // 3️⃣ منع الحذف إذا كان هناك عمال مرتبطون
  if (workersCount > 0) {
    // تسجيل محاولة الحذف المرفوضة في السجلات
    console.warn(`[DeleteGroupBlocked] groupId=${id} workers=${workersCount}`);

    throw new Error(
      'لا يمكن حذف هذه المجموعة لأنها تحتوي على عمال مرتبطين بها. يرجى نقل أو حذف العمال المرتبطين أولاً ثم إعادة المحاولة.'
    );
  }

  // تنفيذ الحذف إذا لم يكن هناك عمال مرتبطون
  await db.delete(groups).where(eq(groups.id, id));
}

// Group Shifts functions removed - using Weekly Schedules instead

