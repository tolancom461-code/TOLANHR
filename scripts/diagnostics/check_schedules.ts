import { createConnection } from 'mysql2/promise';

async function checkSchedules() {
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

    console.log('=== فحص الورديات المحفوظة لمجموعة البنات ===\n');

    // 1. الحصول على group_id لمجموعة البنات
    const [groups]: any = await connection.execute(`
      SELECT id, name FROM \`groups\` WHERE name LIKE '%بنات%'
    `);

    if (groups.length === 0) {
      console.log('❌ لم يتم العثور على مجموعة البنات\n');
      await connection.end();
      return;
    }

    const groupId = groups[0].id;
    console.log(`✅ المجموعة: ${groups[0].name} (ID: ${groupId})\n`);

    // 2. فحص جدول الورديات
    const [schedules]: any = await connection.execute(`
      SELECT * FROM group_schedules
      WHERE group_id = ?
      ORDER BY day_of_week, created_at DESC
    `, [groupId]);

    console.log(`📅 جدول الورديات (${schedules.length} سجل):\n`);
    
    if (schedules.length === 0) {
      console.log('   ❌ لا توجد ورديات محفوظة!\n');
    } else {
      const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      schedules.forEach((s: any, index: number) => {
        console.log(`${index + 1}. ${dayNames[s.day_of_week]}:`);
        console.log(`   ID: ${s.id}`);
        console.log(`   من: ${s.shift_start || s.start_time || 'لا يوجد'}`);
        console.log(`   إلى: ${s.shift_end || s.end_time || 'لا يوجد'}`);
        console.log(`   يوم إجازة: ${s.is_off_day ? 'نعم' : 'لا'}`);
        console.log(`   نشط: ${s.is_active ? 'نعم' : 'لا'}`);
        console.log(`   تاريخ السريان: ${s.effective_date || 'غير محدد'}`);
        console.log(`   تاريخ الإنشاء: ${s.created_at}`);
        console.log('');
      });
    }

    // 3. فحص السجل المالي الجديد لشيراز
    const [workers]: any = await connection.execute(`
      SELECT id FROM workers WHERE full_name LIKE '%شيراز%' LIMIT 1
    `);

    if (workers.length > 0) {
      const workerId = workers[0].id;
      
      const [finance]: any = await connection.execute(`
        SELECT * FROM worker_daily_finance
        WHERE worker_id = ?
        AND work_date = '2026-02-12'
        ORDER BY created_at DESC
        LIMIT 1
      `, [workerId]);

      console.log('💰 السجل المالي الجديد لشيراز (12 فبراير):\n');
      
      if (finance.length === 0) {
        console.log('   ❌ لا يوجد سجل مالي\n');
      } else {
        const f = finance[0];
        console.log(`   ID: ${f.id}`);
        console.log(`   الأجر الأساسي: ${f.base_amount} ريال`);
        console.log(`   الخصومات: ${f.deductions} ريال`);
        console.log(`   الصافي: ${f.net_amount} ريال`);
        console.log(`   دقائق التأخير: ${f.late_minutes || 0} دقيقة`);
        console.log(`   خصم التأخير: ${f.late_penalty || 0} ريال`);
        console.log(`   دقائق الخروج المبكر: ${f.early_leave_minutes || 0} دقيقة`);
        console.log(`   خصم الخروج المبكر: ${f.early_leave_penalty || 0} ريال`);
        console.log(`   تاريخ الإنشاء: ${f.created_at}`);
        console.log(`   تاريخ التحديث: ${f.updated_at}\n`);
      }
    }

    await connection.end();
    console.log('✅ انتهى الفحص');

  } catch (error) {
    console.error('❌ خطأ:', error);
    if (connection) await connection.end();
    process.exit(1);
  }
}

checkSchedules();
