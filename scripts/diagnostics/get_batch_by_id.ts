import { createConnection } from 'mysql2/promise';

async function getBatch() {
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

    console.log('=== البحث عن دفعة الراتب ===\n');

    // 1. عرض أحدث الدفعات
    const [batches]: any = await connection.execute(`
      SELECT * FROM payroll_batches ORDER BY created_at DESC LIMIT 5
    `);

    console.log(`✅ وُجد ${batches.length} دفعة حديثة:\n`);
    batches.forEach((batch: any, index: number) => {
      console.log(`${index + 1}. ID: ${batch.id}`);
      // طباعة جميع الحقول
      Object.keys(batch).forEach(key => {
        if (key !== 'id') {
          console.log(`   ${key}: ${batch[key]}`);
        }
      });
      console.log('');
    });

    await connection.end();
    console.log('✅ انتهى');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

getBatch();
