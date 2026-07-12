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
import { getGroupByCode } from './groups';

// ============================================
// Workers Functions
// ============================================

export async function getAllWorkers(): Promise<DbWorker[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(workers).orderBy(desc(workers.createdAt), desc(workers.id));
}

export async function getWorkersByGroup(groupId: number): Promise<DbWorker[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(workers).where(eq(workers.groupId, groupId)).orderBy(workers.fullName);
}

export async function getWorkerById(id: number): Promise<DbWorker | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWorkerByCode(code: string): Promise<DbWorker | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(workers).where(eq(workers.code, code)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// التحقق من وجود كود العامل مسبقاً
export async function getWorkerByCodeDirect(code: string): Promise<DbWorker | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(workers).where(eq(workers.code, code)).limit(1);
  return result.length > 0 ? result[0] : null;
}
// Helper function to create worker from simplified import data
export async function createWorkerFromImportData(data: {
  code: string;
  fullName: string;
  nationalId?: string | null;
  phone?: string | null;
  groupCode: string;
  hireDate?: string | null;
  status?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get group by code
  const group = await getGroupByCode(data.groupCode);
  if (!group) {
    throw new Error(`المجموعة "${data.groupCode}" غير موجودة`);
  }

  // Create worker with default values
  const workerData: InsertWorker = {
    code: data.code,
    fullName: data.fullName,
    nationalId: data.nationalId || null,
    phone: data.phone || null,
    groupId: group.id,
    jobId: 1, // Default job ID
    dailyRate: group.dailyRate ? String(group.dailyRate) : '0',
    status: (data.status as any) || "active",
    hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return createWorker(workerData);
}


export async function createWorker(worker: InsertWorker): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // التحقق من وجود الكود مسبقاً
  const existingWorker = await getWorkerByCodeDirect(worker.code);
  if (existingWorker) {
    throw new Error(`الكود "${worker.code}" مسجل مسبقاً للعامل "${existingWorker.fullName}"`);
  }

  const result = await db.insert(workers).values(worker);
  return result[0].insertId;
}

export async function updateWorker(id: number, data: Partial<InsertWorker>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(workers).set({ ...data, updatedAt: new Date() }).where(eq(workers.id, id));
}

export async function deleteWorker(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(workers).where(eq(workers.id, id));
}

