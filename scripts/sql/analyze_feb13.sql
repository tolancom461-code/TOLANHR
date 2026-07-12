-- البحث عن السجلات المالية ليوم 13 فبراير 2026
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
ORDER BY wdf.deductions DESC;
