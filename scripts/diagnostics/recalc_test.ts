import { getDb } from './server/db';

async function recalculateTest() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { calculateDailyFinanceFromAttendance } = await import('./server/db');
  
  const workerIds = [420006, 420007, 420008];
  const workDate = '2026-02-25';
  
  console.log('🔄 بدء إعادة الحساب...\n');
  
  for (const workerId of workerIds) {
    try {
      console.log(`⏳ حساب العامل ${workerId}...`);
      const result = await calculateDailyFinanceFromAttendance(workerId, workDate);
      console.log(`✅ النتيجة:`, JSON.stringify(result, null, 2));
    } catch (error: any) {
      console.error(`❌ خطأ:`, error.message);
    }
  }
  
  console.log('\n📊 التحقق من قاعدة البيانات...\n');
  
  const { workerDailyFinance, workers } = await import('./drizzle/schema');
  const { eq } = await import('drizzle-orm');
  
  const results = await db
    .select({
      workerId: workerDailyFinance.workerId,
      fullName: workers.fullName,
      baseAmount: workerDailyFinance.baseAmount,
      netAmount: workerDailyFinance.netAmount,
    })
    .from(workerDailyFinance)
    .leftJoin(workers, eq(workerDailyFinance.workerId, workers.id))
    .where(eq(workerDailyFinance.workDate, workDate));
  
  console.log('النتائج من قاعدة البيانات:');
  console.table(results);
  
  process.exit(0);
}

recalculateTest().catch(console.error);
