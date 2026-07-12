import { getDb } from './server/db';

async function checkBatchSalary() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  const { payrollBatches, payrollBatchItems, workers, groups } = await import('./drizzle/schema');
  const { eq, and } = await import('drizzle-orm');

  // 1. البحث عن الدفعة
  const [batch] = await db.select()
    .from(payrollBatches)
    .where(eq(payrollBatches.batchId, 'Batch-2026-02-001-9yjo'))
    .limit(1);

  if (!batch) {
    console.log("❌ الدفعة غير موجودة!");
    return;
  }

  console.log("\n📊 معلومات الدفعة:");
  console.log("  - رقم الدفعة:", batch.batchId);
  console.log("  - تاريخ الإنشاء:", batch.createdAt);
  console.log("  - الفترة:", batch.periodStart, "→", batch.periodEnd);

  // 2. البحث عن مجموعة البنات
  const [girlsGroup] = await db.select()
    .from(groups)
    .where(eq(groups.name, 'البنات'))
    .limit(1);

  if (!girlsGroup) {
    console.log("\n❌ مجموعة البنات غير موجودة!");
    return;
  }

  console.log("\n👥 معلومات مجموعة البنات:");
  console.log("  - ID:", girlsGroup.id);
  console.log("  - الراتب الحالي:", girlsGroup.dailyWage, "ريال");
  console.log("  - تاريخ التحديث:", girlsGroup.updatedAt);

  // 3. البحث عن عاملة من مجموعة البنات في الدفعة
  const girlsWorkers = await db.select({
    workerId: payrollBatchItems.workerId,
    workerName: workers.fullName,
    baseAmount: payrollBatchItems.baseAmount,
    daysWorked: payrollBatchItems.daysWorked,
  })
    .from(payrollBatchItems)
    .leftJoin(workers, eq(payrollBatchItems.workerId, workers.id))
    .where(and(
      eq(payrollBatchItems.batchId, batch.id),
      eq(workers.groupId, girlsGroup.id)
    ))
    .limit(5);

  console.log("\n💰 عينة من العاملات في الدفعة:");
  for (const worker of girlsWorkers) {
    const dailyRate = worker.daysWorked > 0 ? (worker.baseAmount / worker.daysWorked).toFixed(2) : 0;
    console.log(`  - ${worker.workerName}: ${worker.baseAmount} ريال (${worker.daysWorked} أيام) → ${dailyRate} ريال/يوم`);
  }

  // 4. التحليل
  console.log("\n🔍 التحليل:");
  if (girlsWorkers.length > 0) {
    const firstWorker = girlsWorkers[0];
    const dailyRate = firstWorker.daysWorked > 0 ? (firstWorker.baseAmount / firstWorker.daysWorked) : 0;
    
    if (Math.abs(dailyRate - 90) < 1) {
      console.log("  ❌ الدفعة تستخدم الراتب القديم (90 ريال)");
    } else if (Math.abs(dailyRate - 110) < 1) {
      console.log("  ✅ الدفعة تستخدم الراتب الجديد (110 ريال)");
    } else {
      console.log(`  ⚠️ الدفعة تستخدم راتب مختلف (${dailyRate.toFixed(2)} ريال)`);
    }
  }

  process.exit(0);
}

checkBatchSalary().catch(console.error);
