# توثيق مشروع نظام البصمة — المرجع الرئيسي

**المشروع:** TolanWorkforce / برنامج تحضير اليومية  
**آخر تحديث شامل:** 2026-08-31  
**الخدمة المستقلة:** `biometric-service` v0.9.4  
**الحالة:** مرحلة الخدمة المستقلة مكتملة؛ الربط مع النظام الرئيسي لم يبدأ عمداً.

## ابدأ من هنا

1. `20_STANDALONE_BIOMETRIC_SYSTEM_EXECUTION_PLAN_2026-08-31.md` — **خطة التنفيذ المرجعية للمرحلة الجديدة: نظام إدارة بصمة مستقل كامل + Final Events + بوابة الربط المستقبلية.**
2. `19_FINAL_CLOSURE_REPORT_2026-08-31.md` — تقرير الإغلاق النهائي والحقيقة التشغيلية الحالية.
3. `01_CURRENT_STATUS.md` — لقطة مختصرة للحالة النهائية.
4. `00_BIOMETRIC_MASTER_PLAN.md` — الخطة والحدود المعمارية.
5. `08_REAL_DEVICE_VALIDATION_2026-08-29.md` — إثباتات الجهاز والبروتوكول الأولى.
6. `09_ATTLOG_FIELD_MAPPING.md` — خرائط ATTLOG المثبتة على الجهاز المرجعي.
7. `15_DATABASE_RUNTIME_INTEGRATION_2026-08-30.md` — دمج TiDB داخل الخدمة المستقلة.
8. `16_V0.9.2_RUNTIME_HARDENING_2026-08-31.md` — retry/timezone/policy/log hardening.
9. `18_V0.9.4_ACCEPT_EVENTS_FROM_UTC_FIX_2026-08-31.md` — عيب UTC الذي كشفه الاختبار الحقيقي وإصلاحه.
10. `04_EXECUTION_CHECKLIST.md` — بوابات التنفيذ بعد تحديثها للحالة النهائية.
11. `02_DECISION_LOG.md` و`03_ISSUES_AND_FIXES.md` — تاريخ القرارات والمشاكل.

## القواعد الملزمة

- TiDB الفعلية هي مصدر الحقيقة، وليس `drizzle/schema.ts`.
- أي تغيير DB مستقبلي ينفذه المشغل يدوياً بعد موافقة؛ لا Migration تلقائي.
- `biometric-service` مستقلة ولا تكتب إلى workers/attendance/finance/payroll/shifts/QR.
- لا يتم تخزين biometric templates أو صور أو Password/Card credentials.
- device identity = `vendor + serialNumber`.
- Vendor mappings تبقى داخل Adapter/compatibility profile ولا تعمم بدون إثبات.
- الجهاز الحالي يبقى `mode=test` حتى موافقة مستقلة على بدء مرحلة الربط؛ لا تحويل إلى `live` الآن.

## الحالة المثبتة

```text
Real ADMS connectivity          ✅
OPTIONS / OPERLOG / ATTLOG      ✅
Durable TiDB ingest             ✅
Canonical punch                 ✅
Retry + deduplication           ✅
ACK stop-retry                  ✅
Timezone/UTC normalization      ✅
accept_events_from              ✅ after v0.9.4 fix
mode/status policy              ✅
Diagnostic session + rotation   ✅
Automated tests                 ✅ 97/97
Boundary tests                  ✅ 4/4
Main-app integration            ❌ not started by design
```

## ملاحظة عن الأدلة القديمة

بعض الملفات الأقدم توثق الحالة كما كانت وقت كتابتها (`v0.6` إلى `v0.9.3`) وقد تحتوي عبارات مثل "pending" أو "no DB runtime" كانت صحيحة تاريخياً في ذلك الوقت. عند التعارض، المرجع الحالي هو:

1. `20_STANDALONE_BIOMETRIC_SYSTEM_EXECUTION_PLAN_2026-08-31.md` للمرحلة الجديدة.
2. `19_FINAL_CLOSURE_REPORT_2026-08-31.md` لحقيقة Baseline v0.9.4.
3. `01_CURRENT_STATUS.md` للحالة التشغيلية المختصرة.
4. الكود/الاختبارات في v0.9.4.
5. TiDB الفعلية للبنية والبيانات.
