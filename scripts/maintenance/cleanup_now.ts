import { createConnection } from 'mysql2/promise';

async function cleanup() {
  let connection;
  try {
    connection = await createConnection({
      host: 'autorack.proxy.rlwy.net',
      port: 28461,
      user: 'root',
      password: 'kZNQTZqYJEGPPEcCQrAVOWULOqxmqMJe',
      database: 'railway',
      connectTimeout: 60000
    });

    console.log('Connected to database');

    const [orphans]: any = await connection.execute(`
      SELECT wdf.id, wdf.net_amount
      FROM worker_daily_finance wdf
      WHERE NOT EXISTS (
        SELECT 1 FROM attendance_events ae 
        WHERE ae.worker_id = wdf.worker_id 
        AND ae.work_date = wdf.work_date
      )
    `);

    if (orphans.length === 0) {
      console.log('No orphan records found');
      await connection.end();
      return;
    }

    const totalNet = orphans.reduce((sum: number, r: any) => sum + parseFloat(r.net_amount || '0'), 0);
    const ids = orphans.map((r: any) => r.id);

    await connection.execute(`DELETE FROM worker_daily_finance WHERE id IN (${ids.join(',')})`);

    console.log(`Deleted: ${orphans.length} records`);
    console.log(`Total amount: ${totalNet.toFixed(2)} SAR`);

    await connection.end();
  } catch (error) {
    console.error('Error:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

cleanup();
