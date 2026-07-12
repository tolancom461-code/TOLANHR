import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2aLErcqkQ5WYvxE.root',
  password: 'Tolan@2024',
  database: 'test',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
});

try {
  console.log('=== Deleting old finance records for 2026-02-25 ===');
  
  const [deleteResult] = await connection.execute(`
    DELETE FROM worker_daily_finance
    WHERE work_date = '2026-02-25'
      AND worker_id IN (420006, 420007, 420008)
  `);
  
  console.log(`Deleted ${deleteResult.affectedRows} records`);
  
  console.log('\n=== Triggering recalculation via API ===');
  console.log('Please use the web interface or wait for automatic recalculation');
  
  console.log('\n=== Checking current finance records ===');
  const [rows] = await connection.execute(`
    SELECT 
      worker_id,
      work_date,
      base_amount,
      deductions,
      net_amount
    FROM worker_daily_finance
    WHERE work_date = '2026-02-25'
      AND worker_id IN (420006, 420007, 420008)
    ORDER BY worker_id
  `);
  
  console.table(rows);
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await connection.end();
}
