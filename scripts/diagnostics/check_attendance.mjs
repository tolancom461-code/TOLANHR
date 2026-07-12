import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { attendanceEvents } from "./drizzle/schema.js";
import { eq, and, sql } from "drizzle-orm";

// Get DATABASE_URL from environment or use default
const dbUrl = process.env.DATABASE_URL || "mysql://2aLErcqkQ5WYvxE.root:Tolan@2024@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test?ssl={\"minVersion\":\"TLSv1.2\"}";

const connection = await mysql.createPool(dbUrl);
const db = drizzle(connection);

try {
  console.log('=== Checking attendance for workers on 2026-02-25 ===\n');
  
  const workerIds = [420006, 420007, 420008];
  const workDate = '2026-02-25';
  
  for (const workerId of workerIds) {
    console.log(`\n--- Worker ID: ${workerId} ---`);
    
    const events = await db
      .select()
      .from(attendanceEvents)
      .where(
        and(
          eq(attendanceEvents.workerId, workerId),
          eq(attendanceEvents.workDate, sql`${workDate}`)
        )
      )
      .orderBy(attendanceEvents.eventTime);
    
    if (events.length === 0) {
      console.log('❌ No attendance events found');
    } else {
      console.log(`✅ Found ${events.length} event(s):`);
      events.forEach((e, i) => {
        console.log(`  ${i+1}. ${e.eventType} at ${e.eventTime}`);
      });
      
      const hasCheckIn = events.some(e => e.eventType === 'check_in');
      const hasCheckOut = events.some(e => e.eventType === 'check_out');
      
      console.log(`\nStatus: checkIn=${hasCheckIn}, checkOut=${hasCheckOut}`);
      
      if (!hasCheckIn || !hasCheckOut) {
        console.log('⚠️  PROBLEM: Missing check-in or check-out → baseAmount will be 0!');
      }
    }
  }
  
} catch (error) {
  console.error('Error:', error);
} finally {
  await connection.end();
}
