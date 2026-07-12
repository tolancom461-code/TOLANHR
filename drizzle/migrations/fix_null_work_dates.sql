-- ============================================================
-- إصلاح سجلات الحضور التي تحتوي على work_date = NULL
-- السبب: دالة addMissingCheckIn/addMissingCheckOut لم تكن تعبّئ work_date
-- المنطق: إذا كانت الساعة قبل 5 صباحاً (UTC)، يُعتبر اليوم السابق
-- ============================================================

-- 1. أولاً: عرض السجلات المتأثرة (للمراجعة قبل التنفيذ)
SELECT id, worker_id, event_type, event_time, work_date
FROM attendance_events
WHERE work_date IS NULL
ORDER BY event_time;

-- 2. تحديث work_date بناءً على event_time مع مراعاة قاعدة الساعة 5 صباحاً
UPDATE attendance_events
SET work_date = CASE
    WHEN HOUR(event_time) < 5 THEN DATE_SUB(DATE(event_time), INTERVAL 1 DAY)
    ELSE DATE(event_time)
END
WHERE work_date IS NULL;

-- 3. التحقق من النتيجة
SELECT id, worker_id, event_type, event_time, work_date
FROM attendance_events
WHERE worker_id = 420041
ORDER BY event_time;
