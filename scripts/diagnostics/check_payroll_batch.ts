import { createConnection } from 'mysql2/promise';

async function checkBatch() {
  let connection;
  try {
    connection = await createConnection({
      host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '24yVnB8NmZGjEKv.root',
      password: 'Vw3IXZd5syQI1J2V',
      database: 'test',
      ssl: { rejectUnauthorized: true },
      connectTimeout: 60000
    });

    console.log('=== فحص دفعة الراتب #Batch-2026-02-001-cxag ===\n');

    // 1. الحصول على معلومات الدفعة
    const [batches]: any = await connection.execute(`
      SELECT 
        id,
        title,
        period_start,
        period_end,
        total_amount,
        created_at
      FROM payroll_batches
      WHERE title = 'Batch-2026-02-001-cxag'
    `);

    if (batches.length === 0) {
      console.log('❌ لم يتم العثور على الدفعة');
      await connection.end();
      return;
    }

    const batch = batches[0];
    console.log(`✅ الدفعة: ${batch.title}`);
    console.log(`   الفترة: ${batch.period_start} إلى ${batch.period_end}`);
    console.log(`   المبلغ الإجمالي: ${batch.total_amount} ريال`);
    console.log(`   تاريخ الإنشاء: ${batch.created_at}\n`);

    // 2. البحث عن أبرار في هذه الدفعة
    console.log('🔍 البحث عن أبرار (W54) في الدفعة:\n');
    const [items]: any = await connection.execute(`
      SELECT 
        pbi.id,
        pbi.worker_id,
        w.code,
        w.full_name,
        pbi.work_date,
        pbi.base_amount,
        pbi.deductions,
        pbi.bonuses,
        pbi.net_amount,
        pbi.created_at
      FROM payroll_batch_items pbi
      JOIN workers w ON pbi.worker_id = w.id
      WHERE pbi.batch_id = ?
      AND w.code = 'W54'
      ORDER BY pbi.work_date
    `, [batch.id]);

    if (items.length === 0) {
      console.log('❌ لا توجد سجلات لأبرار في هذه الدفعة\n');
    } else {
      console.log(`✅ وُجد ${items.length} سجل لأبرار:\n`);
      items.forEach((item: any, index: number) => {
        console.log(`${index + 1}. ID: ${item.id}`);
        console.log(`   التاريخ: ${item.work_date}`);
        console.log(`   الأجر الأساسي: ${item.base_amount} ريال`);
        console.log(`   الخصومات: ${item.deductions} ريال`);
        console.log(`   المكافآت: ${item.bonuses} ريال`);
        console.log(`   الصافي: ${item.net_amount} ريال`);
        console.log(`   تاريخ الإنشاء: ${item.created_at}\n`);
      });
    }

    // 3. لكل سجل، فحص البصمات والسجل المالي
    for (const item of items) {
      console.log(`🔬 فحص تفصيلي للتاريخ ${item.work_date}:\n`);
      
      // فحص البصمات
      const [events]: any = await connection.execute(`
        SELECT COUNT(*) as count
        FROM attendance_events
        WHERE worker_id = ?
        AND work_date = ?
      `, [item.worker_id, item.work_date]);
      
      console.log(`   البصمات: ${events[0].count} بصمة`);
      
      // فحص السجل المالي
      const [finance]: any = await connection.execute(`
        SELECT id, net_amount
        FROM worker_daily_finance
        WHERE worker_id = ?
        AND work_date = ?
      `, [item.worker_id, item.work_date]);
      
      if (finance.length > 0) {
        console.log(`   السجل المالي: موجود (ID: ${finance[0].id}, المبلغ: ${finance[0].net_amount})`);
      } else {
        console.log(`   السجل المالي: غير موجود`);
      }
      
      // التحليل
      if (events[0].count === 0 && finance.length === 0) {
        console.log(`   🚨 التحليل: سجل يتيم في الدفعة! لا بصمات ولا سجل مالي\n`);
      } else if (events[0].count === 0 && finance.length > 0) {
        console.log(`   ⚠️  التحليل: سجل مالي يتيم (لا بصمات)\n`);
      } else {
        console.log(`   ✅ التحليل: سجل صحيح\n`);
      }
    }

    await connection.end();
    console.log('✅ انتهى الفحص');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

checkBatch();
