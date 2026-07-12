/**
 * ============================================
 * Backfill Script: work_date for attendance_events
 * ============================================
 * 
 * هذا السكريبت يملأ حقل work_date للبيانات القديمة في جدول attendance_events
 * بناءً على قاعدة اليوم الإداري (5 AM boundary)
 * 
 * الاستخدام:
 * npx tsx scripts/backfill-work-dates.ts
 */

import { getDb } from '../server/db';
import { attendanceEvents } from '../drizzle/schema';
import { sql } from 'drizzle-orm';
import { getAdministrativeWorkDate } from '../server/attendance-logic';

async function backfillWorkDates() {
  console.log('🚀 بدء عملية Backfill لحقل work_date...\n');
  
  const db = await getDb();
  if (!db) {
    console.error('❌ فشل الاتصال بقاعدة البيانات');
    process.exit(1);
  }
  
  try {
    // الحصول على عدد السجلات التي تحتاج إلى تحديث
    const [countResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM attendance_events WHERE work_date IS NULL`
    );
    
    const totalRecords = (countResult as any)[0]?.count || 0;
    console.log(`📊 عدد السجلات التي تحتاج إلى تحديث: ${totalRecords}\n`);
    
    if (totalRecords === 0) {
      console.log('✅ جميع السجلات محدثة بالفعل!');
      return;
    }
    
    // الحصول على جميع السجلات التي تحتاج إلى تحديث
    const events = await db.execute(
      sql`SELECT id, event_time FROM attendance_events WHERE work_date IS NULL ORDER BY id`
    );
    
    const eventsArray = events[0] as any[];
    
    console.log('⏳ جاري معالجة السجلات...\n');
    
    let processedCount = 0;
    const batchSize = 100;
    
    // معالجة السجلات في دفعات (تسلسلياً)
    for (let i = 0; i < eventsArray.length; i += batchSize) {
      const batch = eventsArray.slice(i, i + batchSize);
      
      // تحديث كل سجل في الدفعة بشكل تسلسلي
      for (const event of batch) {
        const eventTime = new Date(event.event_time);
        const workDate = getAdministrativeWorkDate(eventTime);
        
        await db.execute(
          sql`UPDATE attendance_events SET work_date = ${workDate} WHERE id = ${event.id}`
        );
        
        processedCount++;
      }
      
      const progress = ((processedCount / totalRecords) * 100).toFixed(1);
      console.log(`  ✓ تم معالجة ${processedCount} من ${totalRecords} (${progress}%)`);
    }
    
    console.log('\n✅ اكتملت عملية Backfill بنجاح!\n');
    
    // التحقق من النتائج
    const [verifyResult] = await db.execute(
      sql`SELECT COUNT(*) as count FROM attendance_events WHERE work_date IS NULL`
    );
    
    const remainingNull = (verifyResult as any)[0]?.count || 0;
    
    if (remainingNull === 0) {
      console.log('✅ التحقق: جميع السجلات تحتوي على work_date');
    } else {
      console.log(`⚠️  تحذير: لا يزال هناك ${remainingNull} سجل بدون work_date`);
    }
    
    // إحصائيات إضافية
    console.log('\n📊 إحصائيات:');
    const [statsResult] = await db.execute(
      sql`SELECT 
        work_date, 
        COUNT(*) as count 
      FROM attendance_events 
      WHERE work_date IS NOT NULL 
      GROUP BY work_date 
      ORDER BY work_date DESC 
      LIMIT 10`
    );
    
    const stats = statsResult as any[];
    console.log('\nآخر 10 أيام عمل:');
    stats.forEach((stat: any) => {
      console.log(`  ${stat.work_date}: ${stat.count} بصمة`);
    });
    
  } catch (error) {
    console.error('❌ حدث خطأ أثناء عملية Backfill:', error);
    process.exit(1);
  }
}

// تشغيل السكريبت
backfillWorkDates()
  .then(() => {
    console.log('\n🎉 انتهت العملية بنجاح!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ فشلت العملية:', error);
    process.exit(1);
  });
