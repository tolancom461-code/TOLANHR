import { createConnection } from 'mysql2/promise';

async function cleanupOrphanRecords() {
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

    // الحصول على قائمة السجلات اليتيمة
    const [orphanRecords]: any = await connection.execute(`
      SELECT 
        wdf.id,
        wdf.worker_id,
        w.code AS worker_code,
        w.full_name,
        wdf.work_date,
        wdf.base_amount,
        wdf.deductions,
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

    // عرض ملخص السجلات
    let totalBase = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    console.log('=== السجلات التي سيتم حذفها ===\n');
    orphanRecords.forEach((record: any, index: number) => {
      const base = parseFloat(record.base_amount || '0');
      const deductions = parseFloat(record.deductions || '0');
      const net = parseFloat(record.net_amount || '0');
      
      totalBase += base;
      totalDeductions += deductions;
      totalNet += net;

      console.log(`${index + 1}. ID: ${record.id} | ${record.worker_code} - ${record.full_name}`);
      console.log(`   التاريخ: ${record.work_date} | الأساسي: ${base} | الخصومات: ${deductions} | الصافي: ${net}\n`);
    });

    console.log('=== الإجماليات ===');
    console.log(`الأجر الأساسي: ${totalBase.toFixed(2)} ريال`);
    console.log(`الخصومات: ${totalDeductions.toFixed(2)} ريال`);
    console.log(`الصافي: ${totalNet.toFixed(2)} ريال\n`);

    // حذف السجلات
    console.log('🗑️  جاري حذف السجلات اليتيمة...\n');

    const recordIds = orphanRecords.map((r: any) => r.id);
    
    const [result]: any = await connection.execute(`
      DELETE FROM worker_daily_finance 
      WHERE id IN (${recordIds.join(',')})
    `);

    console.log(`✅ تم حذف ${result.affectedRows} سجل بنجاح\n`);
    console.log(`💰 إجمالي المبالغ المحذوفة: ${totalNet.toFixed(2)} ريال\n`);

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

cleanupOrphanRecords();
