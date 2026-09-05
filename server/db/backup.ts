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
// Backup Functions - النسخ الاحتياطي
// ============================================

/**
 * Get all table names and row counts
 */
export async function getBackupTableInfo() {
  const database = await getDb();
  if (!database) return [];
  
  const tables = [
    { name: 'users', label: 'المستخدمين', table: users },
    { name: 'workers', label: 'العمال', table: workers },
    { name: 'groups', label: 'المجموعات', table: groups },
    { name: 'cost_centers', label: 'مراكز التكلفة', table: costCenters },
    { name: 'attendance_events', label: 'سجل الحضور', table: attendanceEvents },
    { name: 'payroll_batches', label: 'دفعات العمال', table: payrollBatches },
    { name: 'payroll_batch_items', label: 'عناصر المبلغ', table: payrollBatchItems },
    { name: 'operational_flags', label: 'البلاغات التشغيلية', table: operationalFlags },
    { name: 'temporary_assignments', label: 'الانتدابات المؤقتة', table: temporaryAssignments },
    { name: 'audit_log', label: 'سجل التدقيق', table: auditLog },
    { name: 'pay_overrides', label: 'التجاوزات المالية', table: payOverrides },
    { name: 'group_schedules', label: 'جداول المجموعات', table: groupSchedules },
    { name: 'worker_daily_finance', label: 'المالية اليومية', table: workerDailyFinance },
  ];
  
  const results = [];
  for (const t of tables) {
    try {
      const countResult = await database.select({ count: count() }).from(t.table);
      results.push({
        name: t.name,
        label: t.label,
        rowCount: countResult[0]?.count || 0,
      });
    } catch {
      results.push({ name: t.name, label: t.label, rowCount: 0 });
    }
  }
  return results;
}

/**
 * Export selected tables as JSON data
 */
export async function exportTablesData(tableNames: string[]) {
  const database = await getDb();
  if (!database) return {};
  
  const tableMap: Record<string, any> = {
    users, workers, groups, costCenters: costCenters, 
    attendance_events: attendanceEvents, payroll_batches: payrollBatches,
    payroll_batch_items: payrollBatchItems, operational_flags: operationalFlags,
    temporary_assignments: temporaryAssignments, audit_log: auditLog,
    pay_overrides: payOverrides, group_schedules: groupSchedules,
    worker_daily_finance: workerDailyFinance, payroll_batch_notes: payrollBatchNotes,
    payroll_batch_corrections: payrollBatchCorrections, work_days: workDays,
    cost_centers: costCenters, deduction_rules: deductionRules,
    user_cost_centers: userCostCenters,
  };
  
  const result: Record<string, any[]> = {};
  for (const name of tableNames) {
    const table = tableMap[name];
    if (table) {
      try {
        const rows = await database.select().from(table);
        result[name] = rows;
      } catch {
        result[name] = [];
      }
    }
  }
  return result;
}

/**
 * Export full SQL dump of all tables
 */
export async function exportFullSqlDump() {
  const database = await getDb();
  if (!database) return '';
  
  const allTables = [
    { name: 'cost_centers', table: costCenters },
    { name: 'users', table: users },
    { name: 'groups', table: groups },
    { name: 'group_schedules', table: groupSchedules },
    { name: 'workers', table: workers },
    { name: 'attendance_events', table: attendanceEvents },
    { name: 'work_days', table: workDays },
    { name: 'worker_daily_finance', table: workerDailyFinance },
    { name: 'pay_overrides', table: payOverrides },
    { name: 'payroll_batches', table: payrollBatches },
    { name: 'payroll_batch_items', table: payrollBatchItems },
    { name: 'payroll_batch_notes', table: payrollBatchNotes },
    { name: 'payroll_batch_corrections', table: payrollBatchCorrections },
    { name: 'operational_flags', table: operationalFlags },
    { name: 'temporary_assignments', table: temporaryAssignments },
    { name: 'audit_log', table: auditLog },
    { name: 'user_cost_centers', table: userCostCenters },
  ];
  
  let sqlDump = `-- Tolan Workforce Backup\n-- Date: ${new Date().toISOString()}\n-- ============================================\n\n`;
  
  for (const t of allTables) {
    try {
      const rows = await database.select().from(t.table);
      if (rows.length === 0) continue;
      
      sqlDump += `-- Table: ${t.name}\n`;
      sqlDump += `-- Rows: ${rows.length}\n`;
      
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(col => {
          const val = (row as any)[col];
          if (val === null || val === undefined) return 'NULL';
          if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
          if (typeof val === 'number') return val.toString();
          if (typeof val === 'boolean') return val ? '1' : '0';
          return `'${String(val).replace(/'/g, "''")}'`;
        });
        sqlDump += `INSERT INTO \`${t.name}\` (${columns.map(c => `\`${c}\``).join(', ')}) VALUES (${values.join(', ')});\n`;
      }
      sqlDump += '\n';
    } catch {
      sqlDump += `-- Error exporting table: ${t.name}\n\n`;
    }
  }
  
  return sqlDump;
}

/**
 * Get backup history (from audit log)
 */
export async function getBackupHistory() {
  const database = await getDb();
  if (!database) return [];
  
  const result = await database
    .select({
      id: auditLog.id,
      action: auditLog.action,
      newValues: auditLog.newValues,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
    })
    .from(auditLog)
    .where(eq(auditLog.tableName, 'backup'))
    .orderBy(desc(auditLog.createdAt))
    .limit(50);
  
  // Get user names
  const userIds = [...new Set(result.filter(r => r.userId).map(r => r.userId!))];
  let userMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const userRows = await database
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, userIds));
    userMap = Object.fromEntries(userRows.map(u => [u.id, u.fullName || '']));
  }
  
  return result.map(r => ({
    ...r,
    userName: r.userId ? userMap[r.userId] || '' : '',
    details: r.newValues ? JSON.parse(r.newValues) : {},
  }));
}


