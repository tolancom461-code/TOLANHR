import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

async function query() {
  console.log('=== Worker W32 Investigation ===\n');
  
  try {
    // 1. Worker info
    console.log('1. Worker Information:');
    const worker = await sql`
      SELECT id, worker_code, name_ar, group_id, daily_rate
      FROM workers
      WHERE worker_code = 'W32'
    `;
    
    if (worker.length === 0) {
      console.log('Worker W32 not found!');
      await sql.end();
      return;
    }
    
    console.log(JSON.stringify(worker[0], null, 2));
    console.log('');
    
    const workerId = worker[0].id;
    
    // 2. Attendance events
    console.log('2. Attendance Events for 2026-02-12:');
    const attendance = await sql`
      SELECT event_type, event_time, method
      FROM attendance_events
      WHERE worker_id = ${workerId}
        AND DATE(event_time) = '2026-02-12'
      ORDER BY event_time
    `;
    console.log(JSON.stringify(attendance, null, 2));
    console.log('');
    
    // 3. Daily finance
    console.log('3. Daily Finance for 2026-02-12:');
    const finance = await sql`
      SELECT *
      FROM worker_daily_finance
      WHERE worker_id = ${workerId}
        AND work_date = '2026-02-12'
    `;
    
    if (finance.length > 0) {
      console.log(JSON.stringify(finance[0], null, 2));
    } else {
      console.log('No finance record found');
    }
    console.log('');
    
    // 4. Group info
    console.log('4. Group Information:');
    const group = await sql`
      SELECT g.*
      FROM groups g
      JOIN workers w ON w.group_id = g.id
      WHERE w.worker_code = 'W32'
    `;
    
    if (group.length > 0) {
      console.log(JSON.stringify(group[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}

query();
