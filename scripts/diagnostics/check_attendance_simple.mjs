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
  console.log('=== Checking attendance for workers on 2026-02-25 ===\n');
  
  const [rows] = await connection.execute(`
    SELECT 
      worker_id,
      event_type,
      event_time,
      work_date
    FROM attendance_events
    WHERE worker_id IN (420006, 420007, 420008)
      AND work_date = '2026-02-25'
    ORDER BY worker_id, event_time
  `);
  
  console.table(rows);
  
  // Group by worker
  const byWorker = {};
  rows.forEach(row => {
    if (!byWorker[row.worker_id]) {
      byWorker[row.worker_id] = [];
    }
    byWorker[row.worker_id].push(row);
  });
  
  console.log('\n=== Analysis ===');
  [420006, 420007, 420008].forEach(workerId => {
    const events = byWorker[workerId] || [];
    const hasCheckIn = events.some(e => e.event_type === 'check_in');
    const hasCheckOut = events.some(e => e.event_type === 'check_out');
    
    console.log(`\nWorker ${workerId}:`);
    console.log(`  Events: ${events.length}`);
    console.log(`  Has check-in: ${hasCheckIn}`);
    console.log(`  Has check-out: ${hasCheckOut}`);
    
    if (!hasCheckIn || !hasCheckOut) {
      console.log(`  ⚠️  PROBLEM: baseAmount will be 0!`);
    } else {
      console.log(`  ✅ OK: Should calculate baseAmount`);
    }
  });
  
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await connection.end();
}
