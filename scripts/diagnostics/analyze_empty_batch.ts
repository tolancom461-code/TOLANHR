import { getDb } from './server/db';

async function analyzeEmptyBatch() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  const { payrollBatches, payrollBatchItems, workers, attendanceEvents, workerDailyFinance, groups } = await import('./drizzle/schema');
  const { eq, and, sql } = await import('drizzle-orm');

  console.log("\n🔍 تحليل دفعة Batch-2026-02-001-99ms\n");

  // 1. معلومات الدفعة
  const [batch] = await db.select()
    .from(payrollBatches)
    .where(eq(payrollBatches.batchId, 'Batch-2026-02-001-99ms'))
    .limit(1);

  if (!batch) {
    console.log("❌ الدفعة غير موجودة!");
    process.exit(1);
  }

  console.log("📊 معلومات الدفعة:");
  console.log("  - رقم الدفعة:", batch.batchId);
  console.log("  - الفترة:", batch.periodStart, "→", batch.periodEnd);
  console.log("  - مركز التكلفة:", batch.costCenterId || "جميع المراكز");
  console.log("  - تاريخ الإنشاء:", batch.createdAt);
  console.log("  - الحالة:", batch.status);

  // 2. عدد العناصر في الدفعة
  const items = await db.select()
    .from(payrollBatchItems)
    .where(eq(payrollBatchItems.batchId, batch.id));

  console.log("\n💰 محتويات الدفعة:");
  console.log("  - عدد العناصر:", items.length);
  
  if (items.length > 0) {
    console.log("\n  العينة:");
    for (const item of items.slice(0, 5)) {
      const [worker] = await db.select({ name: workers.fullName })
        .from(workers)
        .where(eq(workers.id, item.workerId))
        .limit(1);
      console.log(`    - ${worker?.name}: ${item.netAmount} ريال`);
    }
  } else {
    console.log("  ⚠️ الدفعة فارغة!");
  }

  // 3. البصمات في 25 فبراير
  const attendances = await db.select({
    workerId: attendanceEvents.workerId,
    workerName: workers.fullName,
    groupName: groups.name,
    eventType: attendanceEvents.eventType,
    eventTime: attendanceEvents.eventTime,
    workDate: attendanceEvents.workDate,
  })
    .from(attendanceEvents)
    .leftJoin(workers, eq(attendanceEvents.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(attendanceEvents.workDate, '2026-02-25'))
    .limit(10);

  console.log("\n📋 البصمات في 25 فبراير:");
  console.log("  - عدد البصمات:", attendances.length);
  
  if (attendances.length > 0) {
    console.log("\n  العينة:");
    const uniqueWorkers = new Set();
    for (const att of attendances) {
      uniqueWorkers.add(att.workerId);
      console.log(`    - ${att.workerName} (${att.groupName}): ${att.eventType} في ${att.eventTime}`);
    }
    console.log(`\n  عدد العمال الفريدين: ${uniqueWorkers.size}`);
  } else {
    console.log("  ⚠️ لا توجد بصمات!");
  }

  // 4. السجلات المالية في 25 فبراير
  const financeRecords = await db.select({
    workerId: workerDailyFinance.workerId,
    workerName: workers.fullName,
    groupName: groups.name,
    baseAmount: workerDailyFinance.baseAmount,
    netAmount: workerDailyFinance.netAmount,
    createdAt: workerDailyFinance.createdAt,
  })
    .from(workerDailyFinance)
    .leftJoin(workers, eq(workerDailyFinance.workerId, workers.id))
    .leftJoin(groups, eq(workers.groupId, groups.id))
    .where(eq(workerDailyFinance.workDate, '2026-02-25'))
    .limit(10);

  console.log("\n💵 السجلات المالية في 25 فبراير:");
  console.log("  - عدد السجلات:", financeRecords.length);
  
  if (financeRecords.length > 0) {
    console.log("\n  العينة:");
    for (const rec of financeRecords) {
      console.log(`    - ${rec.workerName} (${rec.groupName}): ${rec.netAmount} ريال (أنشئ: ${rec.createdAt})`);
    }
  } else {
    console.log("  ⚠️ لا توجد سجلات مالية!");
  }

  // 5. التحليل
  console.log("\n🔍 التحليل:");
  if (items.length === 0 && attendances.length > 0 && financeRecords.length === 0) {
    console.log("  ❌ السبب: البصمات موجودة لكن السجلات المالية غير موجودة!");
    console.log("  💡 الحل: إعادة معالجة البصمات لإنشاء السجلات المالية");
  } else if (items.length === 0 && financeRecords.length > 0) {
    console.log("  ❌ السبب: السجلات المالية موجودة لكن لم تُضاف إلى الدفعة!");
    console.log("  💡 الحل: إعادة إنشاء الدفعة");
  } else if (attendances.length === 0) {
    console.log("  ❌ السبب: لا توجد بصمات في 25 فبراير!");
  }

  process.exit(0);
}

analyzeEmptyBatch().catch(console.error);
