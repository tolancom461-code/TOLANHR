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
      SELECT pbi.*, w.code, w.full_name
      FROM payroll_batch_items pbi
      JOIN workers w ON pbi.worker_id = w.id
      WHERE pbi.batch_id = ?
      AND pbi.worker_id = ?
    `, [batchId, workerId]);

    if (items.length === 0) {
      console.log('❌ لا توجد سجلات لأبرار في هذه الدفعة\n');
      await connection.end();
      return;
    }

    console.log(`✅ وُجد ${items.length} سجل لأبرار:\n`);
    
    for (const item of items) {
      console.log(`📋 السجل ID: ${item.id}`);
      console.log(`   العامل: ${item.full_name} (${item.code})`);
      
      // طباعة جميع الحقول
      Object.keys(item).forEach(key => {
        if (!['id', 'code', 'full_name', 'worker_id', 'batch_id'].includes(key)) {
          console.log(`   ${key}: ${item[key]}`);
        }
      });
      console.log('');
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
