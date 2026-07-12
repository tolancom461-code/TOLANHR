import { createConnection } from 'mysql2/promise';

async function callCleanupAPI() {
  console.log('🔄 جاري تنفيذ عملية التنظيف...\n');
  
  let connection;
  try {
    connection = await createConnection({
      host: 'autorack.proxy.rlwy.net',
      port: 28461,
      user: 'root',
      password: 'kZNQTZqYJEGPPEcCQrAVOWULOqxmqMJe',
      database: 'railway',
      connectTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    });

    console.log('✅ متصل بقاعدة البيانات\n');

    // الحصول على قائمة السجلات اليتيمة قبل الحذف
    const [orphanRecords]: any = await connection.execute(`
      SELECT 
        wdf.id,
        wdf.worker_id,
        w.code AS worker_code,
        w.full_name,
        wdf.work_date,
        wdf.base_amount,
        wdf.deductions,
        wdf.bonuses,
        wdf.net_amount
      FROM worker_daily_finance wdf
      JOIN workers w ON wdf.worker_id = w.id
      WHERE NOT EXISTS (
        SELECT 1 
        FROM attendance_events ae 
        WHERE ae.worker_id = wdf.worker_id 
        AND ae.work_date = wdf.work_date
      )
      ORDER BY wdf.work_date DESC, w.code
    `);

    console.log(`📊 عدد السجلات اليتيمة المكتشفة: ${orphanRecords.length}\n`);

    if (orphanRecords.length === 0) {
      console.log('✅ لا توجد سجلات يتيمة للحذف');
      await connection.end();
      return;
    }

    // حساب الإجماليات
    let totalBase = 0;
    let totalDeductions = 0;
    let totalBonuses = 0;
    let totalNet = 0;

    console.log('=== السجلات التي سيتم حذفها ===\n');
    orphanRecords.forEach((record: any, index: number) => {
      const base = parseFloat(record.base_amount || '0');
      const deductions = parseFloat(record.deductions || '0');
      const bonuses = parseFloat(record.bonuses || '0');
      const net = parseFloat(record.net_amount || '0');
      
      totalBase += base;
      totalDeductions += deductions;
      totalBonuses += bonuses;
      totalNet += net;

      if (index < 10) { // عرض أول 10 سجلات فقط
        console.log(`${index + 1}. ${record.worker_code} - ${record.full_name}`);
        console.log(`   التاريخ: ${record.work_date} | الصافي: ${net.toFixed(2)} ريال\n`);
      }
    });

    if (orphanRecords.length > 10) {
      console.log(`... و ${orphanRecords.length - 10} سجل آخر\n`);
    }

    console.log('=== الإجماليات قبل الحذف ===');
    console.log(`الأجر الأساسي: ${totalBase.toFixed(2)} ريال`);
    console.log(`الخصومات: ${totalDeductions.toFixed(2)} ريال`);
    console.log(`المكافآت: ${totalBonuses.toFixed(2)} ريال`);
    console.log(`الصافي: ${totalNet.toFixed(2)} ريال\n`);

    // حذف السجلات
    console.log('🗑️  جاري حذف السجلات اليتيمة...\n');

    const recordIds = orphanRecords.map((r: any) => r.id);
    
    const [result]: any = await connection.execute(`
      DELETE FROM worker_daily_finance 
      WHERE id IN (${recordIds.join(',')})
    `);

    console.log('✅ ═══════════════════════════════════════');
    console.log('✅ تم إنجاز عملية التنظيف بنجاح!');
    console.log('✅ ═══════════════════════════════════════\n');
    
    console.log('📊 النتائج النهائية:');
    console.log(`   • عدد السجلات المحذوفة: ${result.affectedRows} سجل`);
    console.log(`   • إجمالي المبلغ الصافي: ${totalNet.toFixed(2)} ريال`);
    console.log(`   • الأجر الأساسي: ${totalBase.toFixed(2)} ريال`);
    console.log(`   • الخصومات: ${totalDeductions.toFixed(2)} ريال`);
    console.log(`   • المكافآت: ${totalBonuses.toFixed(2)} ريال\n`);

    // التحقق من عدم وجود سجلات يتيمة متبقية
    const [remaining]: any = await connection.execute(`
      SELECT COUNT(*) as count
      FROM worker_daily_finance wdf
      WHERE NOT EXISTS (
        SELECT 1 
        FROM attendance_events ae 
        WHERE ae.worker_id = wdf.worker_id 
        AND ae.work_date = wdf.work_date
      )
    `);

    console.log('✅ التحقق النهائي:');
    console.log(`   • السجلات اليتيمة المتبقية: ${remaining[0].count}\n`);

    await connection.end();
    console.log('✅ تم إغلاق الاتصال بقاعدة البيانات');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) {
      await connection.end();
    }
    process.exit(1);
  }
}

callCleanupAPI();
