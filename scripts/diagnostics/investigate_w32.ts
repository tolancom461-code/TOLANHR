import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from './drizzle/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function investigate() {
  console.log('=== Investigation: Worker W32 ===\n');
  
  // 1. Get worker info
  console.log('1. Worker Information:');
  const worker = await db.select().from(schema.workers).where(eq(schema.workers.workerCode, 'W32')).limit(1);
  if (worker.length === 0) {
    console.log('Worker W32 not found!');
    process.exit(1);
  }
  console.log(`   Name: ${worker[0].nameAr}`);
  console.log(`   Code: ${worker[0].workerCode}`);
  console.log(`   ID: ${worker[0].id}`);
  console.log(`   Group ID: ${worker[0].groupId}`);
  console.log(`   Daily Rate: ${worker[0].dailyRate}`);
  console.log('');
  
  const workerId = worker[0].id;
  const groupId = worker[0].groupId;
  
  // 2. Get group info
  if (groupId) {
    console.log('2. Group Information:');
    const group = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
    if (group.length > 0) {
      console.log(`   Name: ${group[0].name}`);
      console.log(`   Daily Wage: ${group[0].dailyWage}`);
      console.log(`   Work Hours: ${group[0].workHours}`);
      console.log(`   Has Flexible Schedule: ${group[0].hasFlexibleSchedule}`);
      console.log(`   Required Hours: ${group[0].requiredHours}`);
    }
    console.log('');
  }
  
  // 3. Get attendance for 2026-02-13
  console.log('3. Attendance Events for 2026-02-13:');
  const attendance = await db.select()
    .from(schema.attendanceEvents)
    .where(
      and(
        eq(schema.attendanceEvents.workerId, workerId),
        sql`DATE(${schema.attendanceEvents.eventTime}) = '2026-02-13'`
      )
    )
    .orderBy(schema.attendanceEvents.eventTime);
  
  if (attendance.length === 0) {
    console.log('   No attendance records found for 2026-02-13');
  } else {
    attendance.forEach(event => {
      console.log(`   ${event.eventType}: ${event.eventTime}`);
    });
  }
  console.log('');
  
  // 4. Get daily finance for 2026-02-13
  console.log('4. Daily Finance for 2026-02-13:');
  const finance = await db.select()
    .from(schema.workerDailyFinance)
    .where(
      and(
        eq(schema.workerDailyFinance.workerId, workerId),
        sql`${schema.workerDailyFinance.workDate} = '2026-02-13'`
      )
    )
    .limit(1);
  
  if (finance.length === 0) {
    console.log('   No finance record found for 2026-02-13');
  } else {
    const f = finance[0];
    console.log(`   Base Amount: ${f.baseAmount}`);
    console.log(`   Deductions: ${f.deductions}`);
    console.log(`   Bonuses: ${f.bonuses}`);
    console.log(`   Net Amount: ${f.netAmount}`);
    console.log(`   Actual Work Minutes: ${f.actualWorkMinutes}`);
    console.log(`   Late Minutes: ${f.lateMinutes}`);
    console.log(`   Early Leave Minutes: ${f.earlyLeaveMinutes}`);
    console.log(`   Notes: ${f.notes || 'N/A'}`);
  }
  console.log('');
  
  // 5. Calculate expected deduction
  console.log('5. Expected Calculation:');
  const dailyWage = 150;
  const requiredMinutes = 480;
  const actualMinutes = 452;
  const missingMinutes = requiredMinutes - actualMinutes;
  const minuteRate = dailyWage / requiredMinutes;
  const expectedDeduction = minuteRate * missingMinutes;
  
  console.log(`   Daily Wage: ${dailyWage} SAR`);
  console.log(`   Required Minutes: ${requiredMinutes}`);
  console.log(`   Actual Minutes: ${actualMinutes}`);
  console.log(`   Missing Minutes: ${missingMinutes}`);
  console.log(`   Minute Rate: ${minuteRate.toFixed(4)} SAR/minute`);
  console.log(`   Expected Deduction: ${expectedDeduction.toFixed(2)} SAR`);
  console.log('');
  
  // 6. Compare with actual
  if (finance.length > 0) {
    const actualDeduction = parseFloat(finance[0].deductions || '0');
    console.log('6. Comparison:');
    console.log(`   Expected: ${expectedDeduction.toFixed(2)} SAR`);
    console.log(`   Actual: ${actualDeduction.toFixed(2)} SAR`);
    console.log(`   Difference: ${(actualDeduction - expectedDeduction).toFixed(2)} SAR`);
    
    if (Math.abs(actualDeduction - expectedDeduction) > 0.01) {
      console.log('   MISMATCH FOUND!');
      
      const impliedMissingMinutes = actualDeduction / minuteRate;
      const impliedActualMinutes = requiredMinutes - impliedMissingMinutes;
      console.log(`\n   Implied Missing Minutes: ${impliedMissingMinutes.toFixed(2)}`);
      console.log(`   Implied Actual Minutes: ${impliedActualMinutes.toFixed(2)}`);
      console.log(`   Stored Actual Minutes: ${finance[0].actualWorkMinutes || 'N/A'}`);
    } else {
      console.log('   Match!');
    }
  }
  
  await client.end();
}

investigate().catch(console.error);
