# الحالة الحالية — 2026-08-31

## 1. ملخص تنفيذي

تم إغلاق مرحلة `biometric-service` المستقلة على **v0.9.4** بعد اختبارات آلية واختبارات جهاز حقيقي وTiDB فعلية.

```text
Service isolation             ✅
Multi-device architecture     ✅ automated
Multi-vendor architecture     ✅ architectural; one real vendor tested
Real ZKTeco connection        ✅
OPTIONS / OPERLOG / ATTLOG    ✅
Retry / replay / dedupe       ✅
ATTLOG ACK                    ✅ real device
Verification mappings         ✅ 5 methods on tested profile
Punch-state mappings          ✅ 6 states on tested profile
TiDB runtime persistence      ✅ real device
Canonical punch               ✅ real device
Timezone -> UTC               ✅ real device
accept_events_from policy     ✅ real device on v0.9.4
mode policy                   ✅ real runtime evidence
status policy                 ✅ runtime rejection evidence + automated ATTLOG coverage
Diagnostic session/rotation   ✅
Current-app integration       ❌ intentionally not started
```

التقرير النهائي المرجعي: `19_FINAL_CLOSURE_REPORT_2026-08-31.md`.

## 2. الإصدار والاختبارات

```text
Package version      0.9.4
Automated suite      97/97 pass
Boundary tests       4/4 pass
Storage mode         database (default)
Database             test
Service port         9095
Vendor adapter       zkteco
```

تمت إعادة `npm test` أثناء توثيق الإغلاق ونجحت 97/97.

## 3. الحالة النهائية للجهاز

```text
Vendor             zkteco
Model              SpeedFace-V5L
Serial             AJE1261900133
Firmware           ZAM230-NF50VA-1.1.9-OCM-4000-Ver1.0.1
Device IP          192.168.10.199
Subnet             255.255.255.0
Gateway            192.168.10.1
DHCP               OFF
Service PC IP      192.168.10.187
Timezone           Asia/Riyadh / UTC+03:00
DST                OFF
NTP                OFF by operator choice
Mode               test
Status             active
accept_events_from NULL
```

**لا يتم تغيير `mode` إلى `live` إلا عند بدء مرحلة الربط مع النظام الرئيسي بموافقة منفصلة.**

## 4. قاعدة البيانات

الجداول الخمسة المملوكة للخدمة:

```text
biometric_svc_devices
biometric_svc_ingest_events
biometric_svc_event_processing
biometric_svc_punches
biometric_svc_device_users
```

الجداول البيومترية القديمة الفارغة تم حذفها يدوياً بعد فحوص الاعتماديات. Runtime لا ينفذ DDL، ولا توجد كتابة إلى جداول التطبيق الرئيسي.

آخر count تم قياسه أثناء الاختبارات:

```text
ingest_events = 8
punches       = 7
```

الفرق مقصود بسبب اختبار `accept_events_from`: حدث واحد تم حفظه durable ولم يتحول إلى Punch.

## 5. الخريطة المثبتة على الجهاز المرجعي

```text
rawStatus 0 -> check_in
rawStatus 1 -> check_out
rawStatus 2 -> break_out
rawStatus 3 -> break_in
rawStatus 4 -> overtime_in
rawStatus 5 -> overtime_out

rawVerify 1  -> fingerprint
rawVerify 3  -> password
rawVerify 4  -> card
rawVerify 15 -> face
rawVerify 25 -> palm
```

هذه القيم خاصة بالـCompatibility Profile للجهاز/firmware المختبر ولا تعمم على جهاز ZKTeco آخر بدون اختبار.

## 6. أهم نتائج الاختبار الحقيقي

- ACK بعد durable TiDB ingest أوقف retry الحقيقي للجهاز.
- duplicates لم تنتج ingest/punch جديداً.
- `check_in`, `break_out`, `overtime_in` ظهرت Canonical بشكل صحيح مع fingerprint.
- `device_event_time_local=09:44:05 Asia/Riyadh` تحول إلى `device_event_time_utc=06:44:05` بشكل صحيح.
- عيب v0.9.3 في مقارنة `accept_events_from` مع وقت الرياض اكتشف فعلياً وأصلح في v0.9.4.
- بعد الإصلاح: count تغير من `6/6` إلى `7/6` عند cutoff المستقبلي، أي durable ingest بدون Punch كما هو مطلوب.
- `mode=maintenance` أدى إلى `device_policy_rejected` في السجل الحقيقي.
- أثناء `status=disabled` ظهرت رفضات policy حقيقية، لكن ATTLOG الخاص بحركة الاختبار تأخر حتى إعادة `active`؛ لذلك لا يتم المبالغة في هذا الدليل.

## 7. الخصوصية

لا templates ولا biometric images ولا password/card credentials ولا unsafe raw payloads في التخزين الدائم.

## 8. نقطة التوقف

```text
Standalone biometric-service = CLOSED / COMPLETE
Main application bridge       = NOT STARTED
Device mode                   = test
```

الخطوة التالية — إن اعتمدت مستقبلاً — هي تصميم Bridge مستقل. لا تغيير إلى `live` ولا ربط بالعمال/الحضور/المالية/QR قبل موافقة جديدة.

## المرحلة التالية المعتمدة — بعد الإغلاق

تم اعتماد قرار بناء **نظام بصمة مستقل كامل** فوق Baseline `v0.9.4` قبل أي ربط مع البرنامج الرئيسي. المرجع التنفيذي الملزم هو:

`20_STANDALONE_BIOMETRIC_SYSTEM_EXECUTION_PLAN_2026-08-31.md`

القرار: البرنامج الرئيسي لا يقرأ الجداول الداخلية ولا يكتب فيها؛ لاحقًا يقرأ **Final Events فقط** عبر عقد قراءة ثابت. الجهاز يبقى `mode=test` حتى إغلاق النظام المستقل الجديد، اختبار Bridge منفصل، وموافقة صريحة على `live`.


---

## تحديث تنفيذ Phase 1/2 — v0.10.0 foundations — 2026-08-31

تم بعد إغلاق Baseline v0.9.4 إنشاء واعتماد خمسة جداول مستقلة إضافية يدويًا في TiDB:

- `biometric_svc_people`
- `biometric_svc_person_device_users`
- `biometric_svc_final_events`
- `biometric_svc_finalization_issues`
- `biometric_svc_audit_log`

وبذلك أصبح عقد schema الخاص بخدمة البصمة يتوقع **10 جداول `biometric_svc_*`**.

قرار الهوية المعتمد:

- `person_code` هو الرقم الموحد للشخص داخل نظام البصمة، مثل `175`.
- عند ظهور Device User جديد يقترح النظام مبدئيًا `person_code = device_user_id` لتبسيط الاستخدام، لكن لا ينشئ الربط الصامت إذا كانت الحالة ملتبسة.
- البرنامج الرئيسي لا يدخل في هذه المرحلة، ولا يوجد `worker_id` داخل جداول نظام البصمة.

تم في v0.10.0 إضافة Backend foundations داخل `biometric-service` فقط لـ:

- إنشاء/قراءة People.
- اكتشاف Device Users غير المربوطين.
- اقتراح `person_code` من `device_user_id`.
- ربط Device User بشخص واحد مع conflict protection.
- السماح للشخص الواحد بالارتباط بعدة Device Users على أجهزة مختلفة.
- Audit آمن لعمليات إنشاء الشخص والربط.

لا توجد Admin HTTP API مكشوفة في هذه الدفعة؛ فتح API للشاشات يأتي بعد تثبيت هذه الطبقة واختبارها.

الجهاز المرجعي يبقى `mode=test` ولا يوجد Main-App Bridge.
