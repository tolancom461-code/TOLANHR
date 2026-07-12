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
import { transformGroup } from './groups';


// ============================================
// Pagination Functions (with LIMIT/OFFSET)
// ============================================

export async function getWorkersWithPagination(
  page: number = 1,
  limit: number = 10,
  groupId?: number,
  searchQuery?: string
): Promise<{ data: DbWorker[]; total: number; page: number; limit: number; totalPages: number }> {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page, limit, totalPages: 0 };

  const offset = (page - 1) * limit;
  
  // Build where conditions
  const conditions = [];
  if (groupId) {
    conditions.push(eq(workers.groupId, groupId));
  }
  if (searchQuery && searchQuery.trim()) {
    const searchTerm = `%${searchQuery.trim()}%`;
    conditions.push(
      or(
        like(workers.fullName, searchTerm),
        like(workers.code, searchTerm),
        like(workers.nationalId, searchTerm)
      )
    );
  }
  
  // Get total count
  const countQuery = conditions.length > 0
    ? db.select({ count: count() }).from(workers).where(and(...conditions))
    : db.select({ count: count() }).from(workers);
  const countResult = await countQuery;
  const total = countResult[0]?.count || 0;

  // Get paginated data
  let query: any = db.select().from(workers).orderBy(desc(workers.createdAt), desc(workers.id));
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  const data = await query.limit(limit).offset(offset);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getGroupsWithPagination(
  page: number = 1,
  limit: number = 10,
  costCenterId?: number
): Promise<{ data: Group[]; total: number; page: number; limit: number; totalPages: number }> {
  const db = await getDb();
  if (!db) return { data: [], total: 0, page, limit, totalPages: 0 };

  const offset = (page - 1) * limit;
  
  // Get total count
  const countResult = costCenterId
    ? await db.select({ count: count() }).from(groups).where(eq(groups.costCenterId, costCenterId))
    : await db.select({ count: count() }).from(groups);
  
  const total = countResult[0]?.count || 0;

  // Get paginated data
  let query: any = db.select().from(groups).orderBy(desc(groups.createdAt));
  if (costCenterId) {
    query = query.where(eq(groups.costCenterId, costCenterId));
  }
  
  const data = await query.limit(limit).offset(offset);

  return {
    data: data.map(transformGroup),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

