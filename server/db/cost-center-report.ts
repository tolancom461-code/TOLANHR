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
// تقرير مستحقات العمالة التشغيلية حسب مركز التكلفة
// ============================================

export async function getCostCenterPayrollReport(
  periodStart: string,
  periodEnd: string,
  costCenterId?: number
) {
  const db = await getDb();
  if (!db) return { costCenters: [], grandTotal: { workerCount: 0, netAmount: 0 } };

  const startDateStr = periodStart.split('T')[0];
  const endDateStr = periodEnd.split('T')[0];

  // Get approved payroll batches in the period
  const conditions: any[] = [
    sql`${payrollBatches.periodStart} >= ${startDateStr}`,
    sql`${payrollBatches.periodEnd} <= ${endDateStr}`,
    eq(payrollBatches.status, 'approved'),
  ];
  if (costCenterId) {
    conditions.push(eq(payrollBatches.costCenterId, costCenterId));
  }

  const batches = await db
    .select({
      batchId: payrollBatches.id,
      costCenterId: payrollBatches.costCenterId,
      costCenterName: costCenters.name,
      groupId: payrollBatches.groupId,
      groupName: groups.name,
      totalWorkers: payrollBatches.totalWorkers,
      totalAmount: payrollBatches.totalAmount,
      totalDeductions: payrollBatches.totalDeductions,
      totalBonuses: payrollBatches.totalBonuses,
    })
    .from(payrollBatches)
    .leftJoin(costCenters, eq(payrollBatches.costCenterId, costCenters.id))
    .leftJoin(groups, eq(payrollBatches.groupId, groups.id))
    .where(and(...conditions));

  // Also get batch items for net amount per batch
  const batchIds = batches.map(b => b.batchId);
  let itemsByBatch = new Map<number, { workerCount: number; netAmount: number }>();
  
  if (batchIds.length > 0) {
    for (const bId of batchIds) {
      const items = await db
        .select({
          netAmount: payrollBatchItems.netAmount,
        })
        .from(payrollBatchItems)
        .where(eq(payrollBatchItems.batchId, bId));
      
      let totalNet = 0;
      items.forEach(item => {
        totalNet += parseFloat(item.netAmount || '0');
      });
      itemsByBatch.set(bId, { workerCount: items.length, netAmount: totalNet });
    }
  }

  // Group by cost center, then by group
  const costCenterMap = new Map<number, {
    costCenterName: string;
    groups: Map<number, {
      groupName: string;
      workerCount: number;
      netAmount: number;
    }>;
  }>();

  batches.forEach(batch => {
    const ccId = batch.costCenterId || 0;
    const ccName = batch.costCenterName || 'غير محدد';
    const gId = batch.groupId || 0;
    const gName = batch.groupName || 'غير محدد';
    const batchData = itemsByBatch.get(batch.batchId) || { workerCount: parseInt(String(batch.totalWorkers || '0')), netAmount: 0 };

    if (!costCenterMap.has(ccId)) {
      costCenterMap.set(ccId, { costCenterName: ccName, groups: new Map() });
    }
    const cc = costCenterMap.get(ccId)!;
    
    if (!cc.groups.has(gId)) {
      cc.groups.set(gId, { groupName: gName, workerCount: 0, netAmount: 0 });
    }
    const grp = cc.groups.get(gId)!;
    grp.workerCount += batchData.workerCount;
    grp.netAmount += batchData.netAmount;
  });

  let grandTotalWorkers = 0;
  let grandTotalNet = 0;

  const result = Array.from(costCenterMap.entries()).map(([ccId, ccData]) => {
    let ccTotalWorkers = 0;
    let ccTotalNet = 0;
    
    const groupsList = Array.from(ccData.groups.entries()).map(([gId, gData]) => {
      ccTotalWorkers += gData.workerCount;
      ccTotalNet += gData.netAmount;
      return {
        groupId: gId,
        groupName: gData.groupName,
        workerCount: gData.workerCount,
        netAmount: parseFloat(gData.netAmount.toFixed(2)),
      };
    });

    grandTotalWorkers += ccTotalWorkers;
    grandTotalNet += ccTotalNet;

    return {
      costCenterId: ccId,
      costCenterName: ccData.costCenterName,
      totalWorkers: ccTotalWorkers,
      totalNetAmount: parseFloat(ccTotalNet.toFixed(2)),
      groups: groupsList,
    };
  });

  return {
    costCenters: result,
    grandTotal: {
      workerCount: grandTotalWorkers,
      netAmount: parseFloat(grandTotalNet.toFixed(2)),
    },
  };
}

/**
 * Run database migration to add flexible schedule columns
 * TEMPORARY: This function should be removed after migration is complete
 */
export async function runMigration() {
  const db = await getDb();
  if (!db) {
    throw new Error('Database connection not available');
  }
  
  console.log('[Migration] Starting migration...');
  
  // Try to add is_flexible_schedule column
  // If it already exists, the query will fail and we'll just log it
  try {
    await db.execute(sql`ALTER TABLE groups ADD COLUMN is_flexible_schedule BOOLEAN DEFAULT 0`);
    console.log('[Migration] ✅ Added is_flexible_schedule column');
  } catch (error: any) {
    // Column might already exist, which is fine
    console.log('[Migration] ℹ️  is_flexible_schedule: ' + (error.message || 'Already exists or error occurred'));
  }
  
  // Try to add required_hours column
  // If it already exists, the query will fail and we'll just log it
  try {
    await db.execute(sql`ALTER TABLE groups ADD COLUMN required_hours REAL`);
    console.log('[Migration] ✅ Added required_hours column');
  } catch (error: any) {
    // Column might already exist, which is fine
    console.log('[Migration] ℹ️  required_hours: ' + (error.message || 'Already exists or error occurred'));
  }
  
  console.log('[Migration] ✅ Migration completed');
}

/**
 * Add 'data_entry' role to the users.role ENUM column
 * TEMPORARY: This function should be removed after migration is complete
 */
export async function runRoleEnumMigration() {
  const db = await getDb();
  if (!db) {
    throw new Error('Database connection not available');
  }
  try {
    await db.execute(sql`ALTER TABLE users MODIFY COLUMN role ENUM('guard','supervisor','supervisor_tolan','supervisor_malqa','admin_affairs','accountant','auditor','finance_manager','executive','super_admin','restaurant_operations','data_entry') NOT NULL DEFAULT 'guard'`);
    console.log('[Migration] ✅ Added data_entry to users.role ENUM');
  } catch (error: any) {
    console.log('[Migration] ℹ️  role ENUM update: ' + (error.message || 'Already up to date or error occurred'));
  }
}


