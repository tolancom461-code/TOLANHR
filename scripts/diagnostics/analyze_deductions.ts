import { createConnection } from 'mysql2/promise';

async function analyze() {
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

    console.log('✅ Connected to database\n');

    // استعلام السجلات المالية ليوم 13 فبراير
    const [rows]: any = await connection.execute(`
      SELECT 
        wdf.id,
        w.code AS worker_code,
        w.full_name,
        w.daily_rate,
        w.group_id,
        wdf.work_date,
        wdf.check_in_time,
        wdf.check_out_time,
        wdf.worked_minutes,
        wdf.financial_minutes,
        wdf.late_minutes,
        wdf.early_leave_minutes,
        wdf.base_amount,
        wdf.deductions,
        wdf.bonuses,
        wdf.net_amount,
        wdf.late_penalty,
        wdf.early_leave_penalty
      FROM worker_daily_finance wdf
      JOIN workers w ON wdf.worker_id = w.id
      WHERE wdf.work_date = '2026-02-13'
      ORDER BY wdf.deductions DESC
      LIMIT 20
    `);

    console.log('=== السجلات المالية ليوم 13 فبراير 2026 ===\n');
    console.log(JSON.stringify(rows, null, 2));

    // الحصول على معلومات مجموعة الأمن
    if (rows.length > 0) {
      const groupId = rows[0].group_id;
      const [groupInfo]: any = await connection.execute(`
        SELECT * FROM groups WHERE id = ?
      `, [groupId]);

      console.log('\n=== معلومات المجموعة ===\n');
      console.log(JSON.stringify(groupInfo, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

analyze();
