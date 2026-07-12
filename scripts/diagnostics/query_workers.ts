import { getDb } from './server/db';
import { eq, and, like } from 'drizzle-orm';

async function queryWorkers() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    return;
  }

  const { workers, groups } = await import('./drizzle/schema');

  // البحث عن خالد محمد عبدالله الركظه
  const worker1 = await db.select({
    id: workers.id,
    code: workers.code,
    fullName: workers.fullName,
    dailyRate: workers.dailyRate,
    groupId: workers.groupId,
  })
  .from(workers)
  .where(like(workers.fullName, '%خالد محمد%الركظه%'))
  .limit(5);

  console.log('\n=== العامل: خالد محمد عبدالله الركظه ===');
  console.log(JSON.stringify(worker1, null, 2));

  // البحث عن محمد مرغوب ثابت
  const worker2 = await db.select({
    id: workers.id,
    code: workers.code,
    fullName: workers.fullName,
    dailyRate: workers.dailyRate,
    groupId: workers.groupId,
  })
  .from(workers)
  .where(like(workers.fullName, '%محمد مرغوب%'))
  .limit(5);

  console.log('\n=== العامل: محمد مرغوب ثابت ===');
  console.log(JSON.stringify(worker2, null, 2));

  // الحصول على معلومات مجموعة الأمن
  if (worker1.length > 0 && worker1[0].groupId) {
    const groupInfo = await db.select()
      .from(groups)
      .where(eq(groups.id, worker1[0].groupId))
      .limit(1);
    
    console.log('\n=== معلومات مجموعة الأمن ===');
    console.log(JSON.stringify(groupInfo, null, 2));
  }

  process.exit(0);
}

queryWorkers().catch(console.error);
