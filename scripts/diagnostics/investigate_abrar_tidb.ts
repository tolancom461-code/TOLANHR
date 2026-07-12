import { createConnection } from 'mysql2/promise';

async function investigate() {
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

    console.log('=== التحقيق في حالة أبرار (W54) - 12 فبراير ===\n');

    // 1. الحصول على worker_id لأبرار
    const [workers]: any = await connection.execute(`
      SELECT id, code, full_name FROM workers WHERE code = 'W54'
    `);

    if (workers.length === 0) {
      console.log('❌ لم يتم العثور على العامل W54');
      await connection.end();
      return;
    }

    const workerId = workers[0].id;
    console.log(`✅ العامل: ${workers[0].full_name} (ID: ${workerId})\n`);

    // 2. استخراج جميع البصمات في 12 فبراير
    console.log('📋 البصمات المسجلة في 12 فبراير 2026:\n');
    const [events]: any = await connection.execute(`
      SELECT 
        id,
        event_type,
        event_time,
        work_date,
        created_at
      FROM attendance_events
      WHERE worker_id = ?
      AND work_date = '2026-02-12'
      ORDER BY event_time
    `, [workerId]);

    if (events.length === 0) {
      console.log('❌ لا توجد بصمات مسجلة\n');
    } else {
      events.forEach((event: any, index: number) => {
        console.log(`${index + 1}. ID: ${event.id}`);
        console.log(`   النوع: ${event.event_type}`);
        console.log(`   الوقت: ${event.event_time}`);
        console.log(`   اليوم الإداري: ${event.work_date}`);
        console.log(`   تاريخ الإنشاء: ${event.created_at}\n`);
      });
    }

    // 3. استخراج السجل المالي
    console.log('💰 السجل المالي في 12 فبراير 2026:\n');
    const [finance]: any = await connection.execute(`
      SELECT 
        id,
        work_date,
        base_amount,
        deductions,
        bonuses,
        net_amount,
        created_at,
        updated_at
      FROM worker_daily_finance
      WHERE worker_id = ?
      AND work_date = '2026-02-12'
    `, [workerId]);

    if (finance.length === 0) {
      console.log('❌ لا يوجد سجل مالي\n');
    } else {
      finance.forEach((record: any) => {
        console.log(`ID: ${record.id}`);
        console.log(`التاريخ: ${record.work_date}`);
        console.log(`الأجر الأساسي: ${record.base_amount} ريال`);
        console.log(`الخصومات: ${record.deductions} ريال`);
        console.log(`المكافآت: ${record.bonuses} ريال`);
        console.log(`الصافي: ${record.net_amount} ريال`);
        console.log(`تاريخ الإنشاء: ${record.created_at}`);
        console.log(`تاريخ التحديث: ${record.updated_at}\n`);
      });
    }

    // 4. التحليل
    console.log('🔍 التحليل:\n');
    
    if (events.length > 0 && finance.length > 0) {
      console.log('✅ يوجد بصمات ويوجد سجل مالي');
      console.log('📊 هذا سجل صحيح (ليس يتيماً)\n');
    } else if (events.length === 0 && finance.length > 0) {
      console.log('❌ لا توجد بصمات لكن يوجد سجل مالي');
      console.log('🚨 هذا سجل يتيم! يجب حذفه\n');
    } else if (events.length > 0 && finance.length === 0) {
      console.log('⚠️  توجد بصمات لكن لا يوجد سجل مالي');
      console.log('💡 ربما لم يتم معالجة البصمات بعد\n');
    } else {
      console.log('✅ لا توجد بصمات ولا سجل مالي');
      console.log('📊 الحالة طبيعية\n');
    }

    // 5. فحص استعلام cleanupOrphanFinanceRecords
    console.log('🧹 فحص استعلام التنظيف:\n');
    const [orphanCheck]: any = await connection.execute(`
      SELECT 
        wdf.id,
        wdf.work_date,
        wdf.net_amount,
        (SELECT COUNT(*) FROM attendance_events ae 
         WHERE ae.worker_id = wdf.worker_id 
         AND ae.work_date = wdf.work_date) as events_count
      FROM worker_daily_finance wdf
      WHERE wdf.worker_id = ?
      AND wdf.work_date = '2026-02-12'
    `, [workerId]);

    if (orphanCheck.length > 0) {
      const record = orphanCheck[0];
      console.log(`السجل المالي ID: ${record.id}`);
      console.log(`عدد البصمات المرتبطة: ${record.events_count}`);
      
      if (record.events_count === 0) {
        console.log('🚨 هذا سجل يتيم! يجب أن يُحذف بواسطة cleanupOrphanFinanceRecords\n');
      } else {
        console.log('✅ هذا سجل صحيح (له بصمات مرتبطة)\n');
      }
    }

    await connection.end();
    console.log('✅ انتهى التحقيق');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

investigate();
