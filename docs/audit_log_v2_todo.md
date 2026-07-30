# خطة العمل الكاملة — الانتقال إلى سجل التدقيق V2
مبنية على وثيقة المتطلبات v1.0 + الفحص الفعلي للكود. آخر تحديث: 25 يوليو 2026.

> راجع أيضاً: [audit_log_v2.md](./audit_log_v2.md) (المرجع المعماري) و[audit_log_v2_dev_guide.md](./audit_log_v2_dev_guide.md) (دليل التحويل خطوة بخطوة)

**رمز الحالة:** ✅ منجز ومُتحقَّق منه فعلياً بالبيانات | 🔲 لم يبدأ | ⏸️ يحتاج قرار منك أولاً

---

## المرحلة 0 — البنية التحتية الأساسية
- [x] ✅ إنشاء جدول `audit_log_v2` في TiDB (34 عمود + 9 فهارس) — متحقَّق
- [x] ✅ إضافة `auditLogV2` إلى `drizzle/schema.ts`
- [x] ✅ إضافة `requestId` موحّد لكل طلب في `server/_core/context.ts`
- [x] ✅ خدمة `AuditService` مركزية كاملة في `server/db/audit-v2.ts`
  (إخفاء أسرار، لقطة هوية مجمّدة، changed_fields تلقائي، سبب إلزامي للحذف، بصمة row_hash)
- [x] ✅ تعديل `logAudit` القديمة لدعم `tx` اختيارية (تشغيل مزدوج داخل نفس المعاملة)
- [x] ✅ تسجيل `audit-v2.ts` في `server/db.ts` (barrel)
- [x] ✅ **أول تحويل كامل ومُختبَر:** `attendance.ts` → `deletePunchEvent` (DELETE_ATTENDANCE)
      — سُجِّل فعلياً بكلا الجدولين بنفس المعاملة، تحقّقنا من البيانات

---

## المرحلة 1 — تحويل باقي الراوترات
لكل عملية: لفّها بـ `database.transaction()`، أضف `db.logAuditV2(...)` بجانب `db.logAudit(...)` القديمة، حدّد `actionCategory` الصحيح، واجعل `reasonText` إلزامياً حيث يتطلب القسم 4 بالوثيقة.

### Tier A — الأولوية القصوى (مالية وصلاحيات) 🔴
- [x] ✅ `server/routers/users.ts` (5 عمليات) — **منجز ومُتحقَّق منه بالكود** (بانتظار اختبار حي وتأكيد من قاعدة البيانات)
  - [x] CREATE_USER
  - [x] UPDATE_USER
  - [x] DELETE_USER *(سبب إلزامي — الواجهة محدَّثة)*
  - [x] UPDATE_USER_ROLE *(actionCategory: CHANGE_ROLE، سبب إلزامي — الواجهة محدَّثة)*
  - [x] ASSIGN_COST_CENTERS
- [ ] 🔲 `server/routers/pay-overrides.ts` (6 عمليات)
  - [ ] CREATE_PAY_OVERRIDE
  - [ ] CREATE_PAY_OVERRIDE_BULK *(parent_event_uuid + سجل لكل عنصر)*
  - [ ] UPDATE_PAY_OVERRIDE
  - [ ] DELETE_PAY_OVERRIDE *(سبب إلزامي)*
  - [ ] APPROVE_PAY_OVERRIDE
  - [ ] REJECT_PAY_OVERRIDE *(سبب إلزامي)*
- [ ] 🔲 `server/routers/deductions.ts` (3 عمليات)
  - [ ] CREATE_DEDUCTION
  - [ ] APPROVE_DEDUCTION
  - [ ] DELETE_DEDUCTION *(سبب إلزامي)*
- [ ] 🔲 `server/routers/financial-recalculation.ts` (1 عملية)
  - [ ] RECALCULATE_FINANCES *(سبب/مصدر التنفيذ إلزامي حسب القسم 4)*
- [ ] 🔲 `server/routers/payroll.ts` (23 عملية — أكبر ملف، يُقسَّم لجلسات فرعية)
  - [ ] CREATE_PAYROLL_BATCH
  - [ ] UPDATE_PAYROLL_ITEM
  - [ ] SUBMIT_PAYROLL_FOR_REVIEW
  - [ ] ACCOUNTANT_APPROVE_PAYROLL / ACCOUNTANT_REJECT_PAYROLL *(رفض = سبب إلزامي)*
  - [ ] AUDITOR_APPROVE_PAYROLL / AUDITOR_REJECT_PAYROLL *(رفض = سبب إلزامي)*
  - [ ] FM_APPROVE_PAYROLL / FM_REJECT_PAYROLL *(رفض = سبب إلزامي)*
  - [ ] SUBMIT_TO_FINAL_REVIEW / APPROVE_BATCH_FINAL / REJECT_BATCH_FINAL *(سبب إلزامي)*
  - [ ] FORCE_DELETE_PAYROLL_BATCH / DELETE_PAYROLL_BATCH *(سبب إلزامي)*
  - [ ] FORCE_UNLOCK_PAYROLL / RELOCK_PAYROLL *(سبب إلزامي)*
  - [ ] ADD_BATCH_NOTE
  - [ ] APPLY_ASSIGNMENT_SETTLEMENTS
  - [ ] ADD_MANUAL_ATTENDANCE_BATCH *(عملية جماعية)*
  - [ ] UPDATE_ATTENDANCE_BATCH *(عملية جماعية)*
  - [ ] ADD_WORKER_TO_BATCH / ADD_WORKER_FROM_OTHER_GROUP_TO_BATCH

### Tier B — الحضور والعمال (الأكثر استخداماً يومياً) 🟠
- [ ] 🔲 `server/routers/attendance.ts` — باقي 6 عمليات (DELETE_ATTENDANCE منجزة)
  - [ ] ADD_FULL_SESSION
  - [ ] ADD_MISSING_CHECK_IN
  - [ ] ADD_MISSING_CHECK_OUT
  - [ ] UPDATE_ATTENDANCE
  - [ ] BULK_UPDATE_ATTENDANCE *(عملية جماعية — parent_event_uuid)*
  - [ ] UPDATE_DAILY_RECORD
- [ ] 🔲 `server/routers/attendance-adjust.ts` (1 عملية)
  - [ ] UPDATE_ATTENDANCE
- [ ] 🔲 `server/routers/workers.ts` (3 عمليات)
  - [ ] CREATE_WORKER
  - [ ] UPDATE_WORKER *(مثال changed_fields الحي اللي جربناه بتغيير الاسم)*
  - [ ] DELETE_WORKER *(سبب إلزامي)*
- [ ] 🔲 `server/routers/daily-finance.ts` (1 عملية)
  - [ ] SET_FULL_DAY_OVERRIDE

### Tier C — تشغيلية 🟡
- [ ] 🔲 `server/routers/operational-flags.ts` (3 عمليات): CREATE_FLAG, APPROVE_FLAG, REJECT_FLAG
- [ ] 🔲 `server/routers/operational-dashboard.ts` (4 عمليات): نفس أعلاه + GENERATE_UNCONFIRMED_FLAGS
- [ ] 🔲 `server/routers/temporary-assignments.ts` (4 عمليات): CREATE/UPDATE/CANCEL/DELETE_TEMP_ASSIGNMENT
- [ ] 🔲 `server/routers/groups.ts` (3 عمليات): CREATE/UPDATE/DELETE_GROUP
- [ ] 🔲 `server/routers/group-schedules.ts` (2 عملية): UPDATE_GROUP_SCHEDULE, UPDATE_WEEKLY_SCHEDULES
- [ ] 🔲 `server/routers/cost-centers.ts` (3 عمليات): CREATE/UPDATE/DELETE_COST_CENTER

### Tier D — إدارية / نظام 🟢
- [ ] 🔲 `server/routers/profile.ts` (2 عملية): UPDATE_PROFILE, CHANGE_PASSWORD
- [ ] 🔲 `server/routers/backup.ts` (3 عمليات): نسخ احتياطي Excel/SQL/CSV — actionCategory: EXPORT
- [ ] 🔲 `server/routers/migration.ts` (1 عملية): تشغيل Migration
- [ ] 🔲 حذف الدالة الميتة المكررة `logAudit` من `server/middleware.ts` (غير مستخدمة إطلاقاً)

---

## المرحلة 2 — واجهة القراءة (Backend + Frontend)
- [ ] 🔲 راوتر tRPC جديد `server/routers/audit-v2.ts`:
  - [ ] `getLog` (فلاتر: تاريخ، مستخدم، action_category، table_name، **record_key/كود بحث** — يحل مشكلة البحث بـ"W109" التي بدأنا منها)
  - [ ] `getTimeline(entityType, recordId)` — خط زمني موحّد لعامل/دفعة/مستخدم (FR-017)
  - [ ] `getStats`
  - [ ] `getRelatedEvents(requestId)` — كل الأحداث المرتبطة بنفس الطلب
- [ ] 🔲 صفحة/تبويب جديد بالواجهة يعرض من `audit_log_v2` (خط زمني + عرض قبل←بعد لكل حقل)
- [ ] 🔲 تصدير Excel حقيقي لسجل التدقيق (باستخدام `excelExport.ts` الموجود)
- [ ] 🔲 تدقيق عملية التصدير نفسها (FR-018 — "من صدّر وماذا صدّر")

---

## المرحلة 3 — الأمن والحماية (مؤجّلة — تحتاج بنية تحتية إضافية)
- [ ] ⏸️ إنشاء مستخدم DB مقيّد بصلاحية INSERT+SELECT فقط على `audit_log_v2`
      *(أعطيك أوامر SQL جاهزة عند البدء — يحتاج تزويد اتصال DB ثانٍ بالتطبيق)*
- [ ] ⏸️ جدول `security_event_log` منفصل لمحاولات الدخول الفاشلة/الرفض الأمني
- [ ] ⏸️ نقاط تفتيش دورية للبصمة (checkpoint hashing) — بديل `previous_hash` الفارغ حالياً
- [ ] ⏸️ آلية `AUDIT_CORRECTION` لتصحيح سجل قديم دون تعديله (FR-016)

---

## المرحلة 4 — الأداء والاحتفاظ
- [ ] ⏸️ سياسة أرشفة السجلات القديمة (بعد قرار إداري بالمدة — قسم 10.1)
- [ ] 🔲 مراقبة فشل كتابة التدقيق والتنبيه الفوري (NFR-006) — عبر `notifications.ts` الموجود

---

## قرارات إدارية معلّقة (ليست عندي — تحتاج قرارك، قسم 14 بالوثيقة)
- [ ] ⏸️ مدة الاحتفاظ بالسجلات لكل نوع حدث
- [ ] ⏸️ هل يُسجَّل فتح بيانات الرواتب/الهوية كـ"اطلاع حساس"؟ ومن المستخدمون المشمولون؟
- [ ] ⏸️ الأدوار التي ترى اللقطات الكاملة أو تملك صلاحية التصدير
- [ ] ⏸️ قائمة `reason_code` المعتمدة رسمياً (حالياً نستخدم `reason_text` حراً فقط)

---

## المرحلة 5 — القبول النهائي
- [ ] 🔲 اختبار كل سيناريوهات AC-001 إلى AC-012 بالوثيقة (قسم 13) على عمليات حقيقية
- [ ] 🔲 مراجعة نهائية شاملة قبل اعتماد التحويل الكامل (قسم 13.1 — شرط الجاهزية للإطلاق)

---

### ملخص سريع للحالة الحالية
**منجز:** البنية التحتية كاملة + `attendance.ts::deletePunchEvent` (DELETE_ATTENDANCE) + `users.ts` كاملاً (5 عمليات) — كلها مُختبَرة أو جاهزة للاختبار
**المتبقي:** 69 نقطة `logAudit` عبر 16 ملف راوتر متبقٍ + واجهة القراءة + بنود أمنية مؤجّلة باتفاق مسبق
