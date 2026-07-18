import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { getDb } from './connection';
import { deductionEntries, workers, users, payrollBatchNotes } from "../../drizzle/schema";

// ============================================
// شاشة "الحسومات" — حسومات إدارية تُعتمد ثم تترحّل تلقائياً لدفعة العمال
// المطابقة لتاريخ استحقاقها (منفصلة تماماً عن خصومات التأخير/الخروج المبكر
// التلقائية الموجودة في حقل "الخصومات").
// ============================================

/**
 * ترحيل الجدول عند بدء التشغيل (idempotent — نفس أسلوب باقي الترحيلات بالمشروع)
 */
export async function runDeductionsMigration() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deduction_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        worker_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        due_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status ENUM('pending','approved','posted') NOT NULL DEFAULT 'pending',
        approved_by INT NULL,
        approved_at TIMESTAMP NULL,
        posted_batch_id INT NULL,
        posted_at TIMESTAMP NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_deduction_entries_worker_id (worker_id),
        INDEX idx_deduction_entries_due_date (due_date),
        INDEX idx_deduction_entries_status (status),
        INDEX idx_deduction_entries_posted_batch (posted_batch_id)
      )
    `);
    console.log('[Migration] ✅ deduction_entries table ready');
  } catch (error: any) {
    console.log('[Migration] ℹ️  deduction_entries: ' + (error.message || 'Already exists or error occurred'));
  }

  try {
    await db.execute(sql`ALTER TABLE payroll_batch_items ADD COLUMN other_deductions DECIMAL(10,2) DEFAULT 0.00`);
    console.log('[Migration] ✅ Added other_deductions column to payroll_batch_items');
  } catch (error: any) {
    console.log('[Migration] ℹ️  other_deductions (items): ' + (error.message || 'Already exists or error occurred'));
  }

  try {
    await db.execute(sql`ALTER TABLE payroll_batches ADD COLUMN total_other_deductions DECIMAL(12,2) DEFAULT 0.00`);
    console.log('[Migration] ✅ Added total_other_deductions column to payroll_batches');
  } catch (error: any) {
    console.log('[Migration] ℹ️  total_other_deductions (batches): ' + (error.message || 'Already exists or error occurred'));
  }
}

export async function createDeduction(params: {
  workerId: number;
  amount: string;
  dueDate: string; // YYYY-MM-DD
  reason: string;
  createdBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(deductionEntries).values({
    workerId: params.workerId,
    amount: params.amount,
    dueDate: params.dueDate,
    reason: params.reason,
    status: 'pending',
    createdBy: params.createdBy,
  });

  return { id: (result as any)[0].insertId };
}

export async function approveDeduction(id: number, approvedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(deductionEntries).where(eq(deductionEntries.id, id)).limit(1);
  if (existing.length === 0) throw new Error("الحسم غير موجود");
  if (existing[0].status !== 'pending') {
    throw new Error("لا يمكن اعتماد هذا الحسم — حالته الحالية: " + existing[0].status);
  }

  await db.update(deductionEntries)
    .set({ status: 'approved', approvedBy, approvedAt: new Date() as any })
    .where(eq(deductionEntries.id, id));

  return { success: true };
}

export async function deleteDeduction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(deductionEntries).where(eq(deductionEntries.id, id)).limit(1);
  if (existing.length === 0) throw new Error("الحسم غير موجود");
  if (existing[0].status === 'posted') {
    throw new Error("لا يمكن حذف حسم تم ترحيله لدفعة عمال بالفعل");
  }

  await db.delete(deductionEntries).where(eq(deductionEntries.id, id));
  return { success: true };
}

/**
 * قائمة الحسومات — مع اسم وكود العامل، وفلترة اختيارية بالحالة
 */
export async function listDeductions(filters?: { status?: 'pending' | 'approved' | 'posted'; workerId?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.status) conditions.push(eq(deductionEntries.status, filters.status));
  if (filters?.workerId) conditions.push(eq(deductionEntries.workerId, filters.workerId));

  const rows = await db
    .select({
      entry: deductionEntries,
      workerName: workers.fullName,
      workerCode: workers.code,
      approverFullName: users.fullName,
    })
    .from(deductionEntries)
    .leftJoin(workers, eq(deductionEntries.workerId, workers.id))
    .leftJoin(users, eq(deductionEntries.approvedBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deductionEntries.dueDate), desc(deductionEntries.createdAt));

  return rows.map((r) => ({
    ...r.entry,
    workerName: r.workerName,
    workerCode: r.workerCode,
    approverFullName: r.approverFullName,
  }));
}

/**
 * الحسومات المعتمدة وغير المُرحّلة بعد، ضمن فترة معينة، لمجموعة عمال محددين.
 * تُستخدم عند إنشاء مسودة دفعة عمال جديدة.
 */
export async function getApprovedUnpostedDeductionsForPeriod(
  workerIds: number[],
  periodStart: string,
  periodEnd: string
) {
  const db = await getDb();
  if (!db || workerIds.length === 0) return [];

  const rows = await db
    .select()
    .from(deductionEntries)
    .where(
      and(
        eq(deductionEntries.status, 'approved'),
        inArray(deductionEntries.workerId, workerIds),
        gte(deductionEntries.dueDate, periodStart),
        lte(deductionEntries.dueDate, periodEnd)
      )
    );

  return rows;
}

/**
 * تعليم الحسومات كمُرحّلة لدفعة معينة، ويمنع ترحيلها مرة أخرى مستقبلاً
 */
export async function markDeductionsAsPosted(deductionIds: number[], batchId: number) {
  const db = await getDb();
  if (!db || deductionIds.length === 0) return;

  await db.update(deductionEntries)
    .set({ status: 'posted', postedBatchId: batchId, postedAt: new Date() as any })
    .where(inArray(deductionEntries.id, deductionIds));
}

/**
 * إضافة ملاحظة بسبب كل حسم مُرحّل إلى ملاحظات دفعة العمال، حتى يظهر السبب
 * بوضوح عند إعداد/مراجعة الدفعة.
 */
export async function addDeductionReasonNotes(params: {
  batchId: number;
  reviewerId: number;
  reviewerRole: string;
  deductions: Array<{ workerId: number; amount: string; reason: string }>;
}) {
  const db = await getDb();
  if (!db || params.deductions.length === 0) return;

  for (const d of params.deductions) {
    await db.insert(payrollBatchNotes).values({
      batchId: params.batchId,
      reviewerId: params.reviewerId,
      reviewerRole: params.reviewerRole,
      noteType: 'info',
      workerId: d.workerId,
      fieldName: 'الحسومات',
      note: `حسم إداري بقيمة ${d.amount}: ${d.reason}`,
    });
  }
}
