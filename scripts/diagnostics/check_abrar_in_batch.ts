import { createConnection } from 'mysql2/promise';

async function checkAbrar() {
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

    console.log('=== فحص أبرار (W54) في دفعة #Batch-2026-02-001-cxag ===\n');

    const batchId = 720001;
    const workerId = 420014; // أبرار

    // 1. البحث عن أبرار في عناصر الدفعة
    const [items]: any = await connection.execute(`
      SELECT 
        pbi.*,
        w.code,
        w.full_name
      FROM payroll_batch_items pbi
      JOIN workers w ON pbi.worker_id = w.id
      WHERE pbi.batch_id = ?
      AND pbi.worker_id = ?
      ORDER BY pbi.work_date
    `, [batchId, workerId]);

    if (items.length === 0) {
      console.log('❌ لا توجد سجلات لأبرار في هذه الدفعة\n');
      await connection.end();
      return;
    }

    console.log(`✅ وُجد ${items.length} سجل لأبرار:\n`);
    
    for (const item of items) {
      console.log(`📋 السجل ID: ${item.id}`);
      console.log(`   التاريخ: ${item.work_date}`);
      console.log(`   الأجر الأساسي: ${item.base_amount} ريال`);
      console.log(`   الخصومات: ${item.deductions} ريال`);
      console.log(`   المكافآت: ${item.bonuses} ريال`);
      console.log(`   الصافي: ${item.net_amount} ريال\n`);

      // فحص البصمات
      const [events]: any = await connection.execute(`
        SELECT COUNT(*) as count
        FROM attendance_events
        WHERE worker_id = ?
        AND work_date = ?
      `, [workerId, item.work_date]);

      console.log(`   🔍 البصمات: ${events[0].count} بصمة`);

      // فحص السجل المالي
      const [finance]: any = await connection.execute(`
        SELECT id, net_amount
        FROM worker_daily_finance
        WHERE worker_id = ?
        AND work_date = ?
      `, [workerId, item.work_date]);

      if (finance.length > 0) {
        console.log(`   💰 السجل المالي: موجود (ID: ${finance[0].id}, المبلغ: ${finance[0].net_amount})`);
      } else {
        console.log(`   💰 السجل المالي: غير موجود`);
      }

      // التحليل
      if (events[0].count === 0 && finance.length === 0) {
        console.log(`   🚨 التحليل: سجل يتيم في الدفعة! لا بصمات ولا سجل مالي`);
        console.log(`   ❌ المشكلة: تم إنشاء الدفعة من بيانات غير موجودة!\n`);
      } else if (events[0].count === 0 && finance.length > 0) {
        console.log(`   ⚠️  التحليل: سجل مالي يتيم (لا بصمات)`);
        console.log(`   ❌ المشكلة: السجل المالي موجود رغم عدم وجود بصمات!\n`);
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

checkAbrar();
