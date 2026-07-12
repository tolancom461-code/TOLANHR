import { createConnection } from 'mysql2/promise';

async function analyzeShiraz() {
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

    console.log('=== تحليل مشكلة الخصم على شيراز - 12 فبراير ===\n');

    // 1. البحث عن شيراز
    const [workers]: any = await connection.execute(`
      SELECT w.*, g.name as group_name
      FROM workers w
      LEFT JOIN \`groups\` g ON w.group_id = g.id
      WHERE w.full_name LIKE '%شيراز%'
      LIMIT 5
    `);

    if (workers.length === 0) {
      console.log('❌ لم يتم العثور على شيراز\n');
      await connection.end();
      return;
    }

    console.log(`✅ وُجد ${workers.length} عامل:\n`);
    workers.forEach((w: any, i: number) => {
      console.log(`${i + 1}. ${w.full_name} (${w.code}) - المجموعة: ${w.group_name}`);
    });
    console.log('');

    // استخدام أول نتيجة
    const worker = workers[0];
    console.log(`📋 تحليل: ${worker.full_name} (${worker.code})\n`);

    // 2. معلومات المجموعة
    const [groups]: any = await connection.execute(`
      SELECT * FROM \`groups\` WHERE id = ?
    `, [worker.group_id]);

    if (groups.length > 0) {
      const group = groups[0];
      console.log('👥 معلومات المجموعة:\n');
      console.log(`   الاسم: ${group.name}`);
      console.log(`   دقائق العمل: ${group.work_minutes} دقيقة`);
      console.log(`   تكلفة الدقيقة: ${group.minute_cost} ريال`);
      console.log(`   نسبة خصم التأخير: ${group.late_penalty_rate}%`);
      console.log(`   نسبة خصم الخروج المبكر: ${group.early_leave_penalty_rate}%`);
      console.log(`   نوع المجموعة: ${group.is_flexible ? 'مرنة' : 'عادية'}\n`);
    }

    // 3. جدول الورديات
    const [schedules]: any = await connection.execute(`
      SELECT * FROM group_schedules
      WHERE group_id = ?
      ORDER BY day_of_week
    `, [worker.group_id]);

    console.log('📅 جدول الورديات:\n');
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    schedules.forEach((s: any) => {
      console.log(`   ${dayNames[s.day_of_week]}: ${s.shift_start || 'لا يوجد'} - ${s.shift_end || 'لا يوجد'} ${s.is_off_day ? '(إجازة)' : ''}`);
    });
    console.log('');

    // 4. البصمات في 12 فبراير
    const [events]: any = await connection.execute(`
      SELECT * FROM attendance_events
      WHERE worker_id = ?
      AND work_date = '2026-02-12'
      ORDER BY event_time
    `, [worker.id]);

    console.log('🕐 البصمات في 12 فبراير:\n');
    if (events.length === 0) {
      console.log('   ❌ لا توجد بصمات\n');
    } else {
      events.forEach((e: any, i: number) => {
        console.log(`   ${i + 1}. ${e.event_type}: ${e.event_time}`);
      });
      console.log('');
    }

    // 5. السجل المالي
    const [finance]: any = await connection.execute(`
      SELECT * FROM worker_daily_finance
      WHERE worker_id = ?
      AND work_date = '2026-02-12'
    `, [worker.id]);

    console.log('💰 السجل المالي في 12 فبراير:\n');
    if (finance.length === 0) {
      console.log('   ❌ لا يوجد سجل مالي\n');
    } else {
      const f = finance[0];
      console.log(`   الأجر الأساسي: ${f.base_amount} ريال`);
      console.log(`   الخصومات: ${f.deductions} ريال`);
      console.log(`   المكافآت: ${f.bonuses} ريال`);
      console.log(`   الصافي: ${f.net_amount} ريال`);
      console.log(`   دقائق العمل: ${f.work_minutes} دقيقة`);
      console.log(`   دقائق التأخير: ${f.late_minutes || 0} دقيقة`);
      console.log(`   دقائق الخروج المبكر: ${f.early_leave_minutes || 0} دقيقة`);
      console.log(`   خصم التأخير: ${f.late_penalty || 0} ريال`);
      console.log(`   خصم الخروج المبكر: ${f.early_leave_penalty || 0} ريال\n`);
    }

    await connection.end();
    console.log('✅ انتهى التحليل');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

analyzeShiraz();
