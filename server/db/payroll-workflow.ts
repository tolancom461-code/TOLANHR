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

import { getActorLabel } from './_shared';

// ============================================
// Payroll Workflow Functions
// ============================================

export async function submitBatchToAccounting(batchId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'draft') throw new Error('Only draft batches can be submitted to accounting');
  
  await db.update(payrollBatches)
    .set({
      status: 'under_accountant_review',
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  // 🔔 إشعار المحاسب (وكذلك الأدمن/الإدارة العليا) بوصول دفعة جديدة للمراجعة
  const senderLabel2 = await getActorLabel(db, userId);
  await notifyStageAndAdmins({
    stageRole: 'accountant',
    title: "📤 دفعة رواتب بانتظار المراجعة المحاسبية",
    message: `أرسل ${senderLabel2} الدفعة ${batch.batchCode} للمراجعة المحاسبية.`,
    type: 'info',
    link: `/payroll/batches/${batchId}`,
  });
  
  return { success: true };
}

export async function submitBatchToFinalReview(batchId: number, userId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'under_accountant_review') throw new Error('Batch must be under accounting review');
  
  await db.update(payrollBatches)
    .set({
      status: 'under_financial_review',
      notes: reason || batch.notes,
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  // 🔔 إشعار المراجع المالي (وكذلك الأدمن/الإدارة العليا) باعتماد المحاسب وإرسال الدفعة إليه
  const accountantLabel = await getActorLabel(db, userId);
  await notifyStageAndAdmins({
    stageRole: 'auditor',
    title: "📤 دفعة رواتب بانتظار المراجعة المالية",
    message: `اعتمد ${accountantLabel} الدفعة ${batch.batchCode} وأرسلها للمراجعة المالية.`,
    type: 'info',
    link: `/payroll/batches/${batchId}`,
  });
  
  return { success: true };
}

export async function submitBatchForApproval(batchId: number, userId: number, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'under_financial_review') throw new Error('Batch must be under financial review');
  
  await db.update(payrollBatches)
    .set({
      status: 'under_accounts_manager_review',
      notes: reason || batch.notes,
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  // 🔔 إشعار المدير المالي (وكذلك الأدمن/الإدارة العليا) باعتماد المراجع وإرسال الدفعة إليه للاعتماد النهائي
  const auditorLabel = await getActorLabel(db, userId);
  await notifyStageAndAdmins({
    stageRole: 'finance_manager',
    title: "📤 دفعة رواتب بانتظار الاعتماد النهائي",
    message: `اعتمد ${auditorLabel} الدفعة ${batch.batchCode} وأرسلها للاعتماد النهائي.`,
    type: 'info',
    link: `/payroll/batches/${batchId}`,
  });
  
  return { success: true };
}

export async function approveBatch(batchId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'under_accounts_manager_review') throw new Error('Batch must be pending approval');
  
  await db.update(payrollBatches)
    .set({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  // Send notifications to stakeholders
  const approverLabel = await getActorLabel(db, userId);
  const stakeholders = [batch.createdBy, batch.accountantApprovedBy, batch.auditorApprovedBy].filter(id => id !== null) as number[];
  const uniqueStakeholders = [...new Set(stakeholders)];
  
  for (const stakeholderId of uniqueStakeholders) {
    await sendNotification({
      userId: stakeholderId,
      title: "✅ تم اعتماد الدفعة",
      message: `اعتمد ${approverLabel} الدفعة ${batch.batchCode} اعتمادًا نهائيًا.`,
      type: 'success',
      link: `/payroll/batches/${batchId}`
    });
  }

  // 🔔 إشعار الأدمن والإدارة العليا أيضًا بالاعتماد النهائي
  await sendNotificationToRoles({
    roles: ADMIN_OWNER_ROLES,
    title: "✅ تم اعتماد الدفعة",
    message: `اعتمد ${approverLabel} الدفعة ${batch.batchCode} اعتمادًا نهائيًا.`,
    type: 'success',
    link: `/payroll/batches/${batchId}`,
  });
  
  return { success: true };
}

export async function rejectBatch(batchId: number, userId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  
  // Allow rejection from any review stage
  const reviewStatuses = ['under_accountant_review', 'under_financial_review', 'under_accounts_manager_review'];
  if (!batch.status || !reviewStatuses.includes(batch.status)) {
    throw new Error('يمكن رفض الدفعة فقط من مراحل المراجعة');
  }
  
  const rejectionCount = (batch.rejectionCount || 0) + 1;
  
  // تحديد الجهة التي رفضت الدفعة بناءً على المرحلة الحالية قبل الإرجاع للمسودة
  const rejectorLabel: Record<string, string> = {
    under_accountant_review: 'المحاسب المالي',
    under_financial_review: 'المراجع المالي',
    under_accounts_manager_review: 'المدير المالي',
  };
  const rejectedByText = rejectorLabel[batch.status] || 'أحد المراجعين';
  
  // Return batch to draft status for editing/deletion
  await db.update(payrollBatches)
    .set({
      status: 'draft', // Return to draft for editing
      notes: reason,
      rejectionCount,
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  // Send notifications to stakeholders
  const rejectorLabel2 = await getActorLabel(db, userId);
  const stakeholders = [batch.createdBy, batch.accountantApprovedBy, batch.auditorApprovedBy].filter(id => id !== null) as number[];
  const uniqueStakeholders = [...new Set(stakeholders)];
  
  for (const stakeholderId of uniqueStakeholders) {
    await sendNotification({
      userId: stakeholderId,
      title: "❌ تم رفض الدفعة",
      message: `رفض ${rejectorLabel2} الدفعة ${batch.batchCode}. السبب: ${reason}`,
      type: 'error',
      link: `/payroll/batches/${batchId}`
    });
  }

  // 🔔 إشعار الأدمن والإدارة العليا أيضًا بالرفض
  await sendNotificationToRoles({
    roles: ADMIN_OWNER_ROLES,
    title: "❌ تم رفض الدفعة",
    message: `رفض ${rejectorLabel2} الدفعة ${batch.batchCode}. السبب: ${reason}`,
    type: 'error',
    link: `/payroll/batches/${batchId}`,
  });
  
  return { success: true };
}

export async function updateBatchData(batchId: number, userId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [batch] = await db.select().from(payrollBatches).where(eq(payrollBatches.id, batchId)).limit(1);
  if (!batch) throw new Error('Batch not found');
  
  // Allow updates only in review stages
  const allowedStatuses = ['under_accountant_review', 'under_financial_review'];
  if (!batch.status || !allowedStatuses.includes(batch.status)) {
    throw new Error('Batch cannot be modified in current status');
  }
  
  await db.update(payrollBatches)
    .set({
      notes: reason,
      updatedAt: new Date(),
    })
    .where(eq(payrollBatches.id, batchId));
  
  return { success: true };
}


