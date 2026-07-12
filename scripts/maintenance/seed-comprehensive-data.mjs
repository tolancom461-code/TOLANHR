/**
 * Comprehensive Data Seeding Script
 * Creates 10 groups with different shifts, 80+ workers, and attendance data
 * for January 1-29, 2026 with various scenarios
 */

import { db } from '../../server/db.ts';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tolanworkforce',
});

const database = drizzle(connection);

// Group configurations with different shifts
const groupConfigs = [
  { name: 'صباحي - الفريق الأول', code: 'GRP-MORNING-1', shift: '06:00-14:00', dailyWage: 200 },
  { name: 'صباحي - الفريق الثاني', code: 'GRP-MORNING-2', shift: '06:00-14:00', dailyWage: 200 },
  { name: 'ظهيري - الفريق الأول', code: 'GRP-AFTERNOON-1', shift: '14:00-22:00', dailyWage: 220 },
  { name: 'ظهيري - الفريق الثاني', code: 'GRP-AFTERNOON-2', shift: '14:00-22:00', dailyWage: 220 },
  { name: 'ليلي - الفريق الأول', code: 'GRP-NIGHT-1', shift: '22:00-06:00', dailyWage: 250 },
  { name: 'ليلي - الفريق الثاني', code: 'GRP-NIGHT-2', shift: '22:00-06:00', dailyWage: 250 },
  { name: 'مرن - الفريق الأول', code: 'GRP-FLEXIBLE-1', shift: '08:00-16:00', dailyWage: 180 },
  { name: 'مرن - الفريق الثاني', code: 'GRP-FLEXIBLE-2', shift: '08:00-16:00', dailyWage: 180 },
  { name: 'إدارة - الفريق الأول', code: 'GRP-ADMIN-1', shift: '08:00-17:00', dailyWage: 300 },
  { name: 'دعم - الفريق الأول', code: 'GRP-SUPPORT-1', shift: '09:00-18:00', dailyWage: 190 },
];

// Worker names (Arabic names)
const firstNames = [
  'محمد', 'أحمد', 'علي', 'عمر', 'خالد', 'سارة', 'فاطمة', 'نور',
  'يوسف', 'إبراهيم', 'حسن', 'حسين', 'مريم', 'ليلى', 'دينا', 'زيد',
];

const lastNames = [
  'الأحمد', 'الحسن', 'الحسني', 'الخالدي', 'السعيد', 'الجابري', 'الشامسي', 'الفلاحي',
  'الكتبي', 'الظاهري', 'الشرقي', 'الغربي', 'الشمالي', 'الجنوبي', 'المحمودي', 'الراشدي',
];

async function seedData() {
  console.log('🌱 بدء إضافة البيانات الشاملة...\n');

  try {
    // Step 1: Create Groups
    console.log('📋 الخطوة 1: إنشاء 10 مجموعات مع ورديات مختلفة...');
    const groupIds = [];

    for (const groupConfig of groupConfigs) {
      const [shiftStart, shiftEnd] = groupConfig.shift.split('-');
      
      const group = await db.createGroup({
        name: groupConfig.name,
        code: groupConfig.code,
        dailyWage: groupConfig.dailyWage,
        workMinutes: 480, // 8 hours
        latePenaltyRate: 5, // 5% per hour
        earlyLeavePenaltyRate: 5, // 5% per hour
        shiftStartTime: shiftStart,
        shiftEndTime: shiftEnd,
      });

      groupIds.push(group.id);
      console.log(`   ✅ تم إنشاء مجموعة: ${groupConfig.name} (ID: ${group.id})`);
    }

    // Step 2: Create Workers
    console.log('\n👥 الخطوة 2: إضافة 80+ عامل (8+ لكل مجموعة)...');
    const workerIds = [];
    let workerCount = 0;

    for (let groupIdx = 0; groupIdx < groupIds.length; groupIdx++) {
      const groupId = groupIds[groupIdx];
      const workersPerGroup = 8 + Math.floor(Math.random() * 3); // 8-10 workers per group

      for (let i = 0; i < workersPerGroup; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const fullName = `${firstName} ${lastName}`;
        const code = `WRK-${groupIdx + 1}-${String(i + 1).padStart(2, '0')}`;

        const worker = await db.createWorker({
          fullName,
          code,
          groupId,
          dailyRate: 150 + Math.random() * 100, // 150-250
          status: 'active',
        });

        workerIds.push(worker.id);
        workerCount++;
      }

      console.log(`   ✅ تم إضافة ${workersPerGroup} عمال للمجموعة ${groupIdx + 1}`);
    }

    console.log(`   📊 إجمالي العمال المضافين: ${workerCount}`);

    // Step 3: Create Weekly Payroll Batches
    console.log('\n💰 الخطوة 3: إنشاء دفعات رواتب أسبوعية...');
    const batchIds = [];

    const weeks = [
      { start: '2026-01-01', end: '2026-01-07', label: 'الأسبوع الأول' },
      { start: '2026-01-08', end: '2026-01-14', label: 'الأسبوع الثاني' },
      { start: '2026-01-15', end: '2026-01-21', label: 'الأسبوع الثالث' },
      { start: '2026-01-22', end: '2026-01-29', label: 'الأسبوع الرابع' },
    ];

    for (const week of weeks) {
      for (let groupIdx = 0; groupIdx < groupIds.length; groupIdx++) {
        const batch = await db.createPayrollBatch({
          periodStart: week.start,
          periodEnd: week.end,
          groupId: groupIds[groupIdx],
          costCenterId: null,
          createdBy: 1,
        });

        batchIds.push(batch.batchId);
        console.log(`   ✅ ${week.label} - المجموعة ${groupIdx + 1}: ${batch.batchCode}`);
      }
    }

    // Step 4: Record Attendance with Various Scenarios
    console.log('\n📅 الخطوة 4: تسجيل بيانات الحضور مع جميع السيناريوهات...');

    const scenarios = [
      { type: 'present', probability: 0.70, label: 'حضور عادي' },
      { type: 'late', probability: 0.15, label: 'تأخير' },
      { type: 'early_leave', probability: 0.10, label: 'خروج مبكر' },
      { type: 'absent', probability: 0.05, label: 'غياب' },
    ];

    let attendanceCount = 0;
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-01-29');

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Skip Fridays (day 5) and Saturdays (day 6)
      if (d.getDay() === 5 || d.getDay() === 6) continue;

      const dateStr = d.toISOString().split('T')[0];

      for (const workerId of workerIds) {
        // Determine scenario
        const rand = Math.random();
        let scenario = scenarios[0]; // default: present

        let cumulative = 0;
        for (const s of scenarios) {
          cumulative += s.probability;
          if (rand < cumulative) {
            scenario = s;
            break;
          }
        }

        // Record attendance based on scenario
        if (scenario.type === 'present') {
          await db.recordAttendance({
            workerId,
            attendanceDate: new Date(dateStr),
            checkInTime: '08:00',
            checkOutTime: '17:00',
            status: 'present',
          });
          attendanceCount++;
        } else if (scenario.type === 'late') {
          const lateMinutes = 15 + Math.floor(Math.random() * 45); // 15-60 minutes late
          const lateHour = String(8 + Math.floor(lateMinutes / 60)).padStart(2, '0');
          const lateMin = String(lateMinutes % 60).padStart(2, '0');

          await db.recordAttendance({
            workerId,
            attendanceDate: new Date(dateStr),
            checkInTime: `${lateHour}:${lateMin}`,
            checkOutTime: '17:00',
            status: 'late',
          });
          attendanceCount++;
        } else if (scenario.type === 'early_leave') {
          const earlyMinutes = 15 + Math.floor(Math.random() * 45); // 15-60 minutes early
          const earlyHour = String(17 - Math.floor(earlyMinutes / 60)).padStart(2, '0');
          const earlyMin = String(60 - (earlyMinutes % 60)).padStart(2, '0');

          await db.recordAttendance({
            workerId,
            attendanceDate: new Date(dateStr),
            checkInTime: '08:00',
            checkOutTime: `${earlyHour}:${earlyMin}`,
            status: 'present',
          });
          attendanceCount++;
        } else if (scenario.type === 'absent') {
          await db.recordAttendance({
            workerId,
            attendanceDate: new Date(dateStr),
            checkInTime: null,
            checkOutTime: null,
            status: 'absent',
          });
          attendanceCount++;
        }
      }
    }

    console.log(`   ✅ تم تسجيل ${attendanceCount} سجل حضور`);

    // Step 5: Add Deductions and Bonuses
    console.log('\n💸 الخطوة 5: إضافة خصومات ومكافآت...');

    let deductionCount = 0;
    let bonusCount = 0;

    for (let i = 0; i < workerIds.length; i++) {
      const workerId = workerIds[i];

      // Add random deductions
      if (Math.random() > 0.5) {
        const deductionAmount = 50 + Math.random() * 150; // 50-200
        const deductionDate = new Date('2026-01-15');

        await db.addDeduction({
          workerId,
          deductionDate,
          amount: deductionAmount,
          reason: 'خصم إداري',
          deductionType: 'deduction',
        });

        deductionCount++;
      }

      // Add random bonuses
      if (Math.random() > 0.7) {
        const bonusAmount = 100 + Math.random() * 300; // 100-400
        const bonusDate = new Date('2026-01-20');

        await db.addDeduction({
          workerId,
          deductionDate: bonusDate,
          amount: -bonusAmount, // Negative for bonus
          reason: 'مكافأة أداء',
          deductionType: 'deduction',
        });

        bonusCount++;
      }
    }

    console.log(`   ✅ تم إضافة ${deductionCount} خصم و ${bonusCount} مكافأة`);

    // Step 6: Record Overtime
    console.log('\n⏱️ الخطوة 6: تسجيل ساعات إضافية...');

    let overtimeCount = 0;

    for (let i = 0; i < workerIds.length; i++) {
      if (Math.random() > 0.8) {
        const workerId = workerIds[i];
        const overtimeDate = new Date('2026-01-25');
        const overtimeMinutes = 60 + Math.floor(Math.random() * 180); // 1-4 hours

        await db.recordOvertime({
          workerId,
          overtimeDate,
          overtimeMinutes,
          reason: 'عمل إضافي',
        });

        overtimeCount++;
      }
    }

    console.log(`   ✅ تم تسجيل ${overtimeCount} سجل ساعات إضافية`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ تم إضافة البيانات بنجاح!');
    console.log('='.repeat(60));
    console.log(`📊 ملخص البيانات المضافة:`);
    console.log(`   • المجموعات: ${groupIds.length}`);
    console.log(`   • العمال: ${workerCount}`);
    console.log(`   • دفعات الرواتب: ${batchIds.length}`);
    console.log(`   • سجلات الحضور: ${attendanceCount}`);
    console.log(`   • الخصومات والمكافآت: ${deductionCount + bonusCount}`);
    console.log(`   • الساعات الإضافية: ${overtimeCount}`);
    console.log('='.repeat(60));

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ خطأ أثناء إضافة البيانات:', error);
    await connection.end();
    process.exit(1);
  }
}

// Run the seeding
seedData();
