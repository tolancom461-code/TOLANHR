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
// Cost Centers Functions
// ============================================

export async function getAllCostCenters() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(costCenters).orderBy(costCenters.name);
}

export async function createCostCenter(data: {
  code: string;
  name: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [result] = await db.insert(costCenters).values({
    code: data.code,
    name: data.name,
    description: data.description || null,
    isActive: true,
  });

  return { id: Number(result.insertId), success: true };
}

export async function updateCostCenter(id: number, data: {
  code?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.update(costCenters)
    .set(data)
    .where(eq(costCenters.id, id));

  return { success: true };
}

export async function deleteCostCenter(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  await db.delete(costCenters).where(eq(costCenters.id, id));

  return { success: true };
}

