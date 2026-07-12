# 📁 فهرس بنية المشروع — TolanWorkforce

> آخر تحديث: 2026-07-11 — بعد إعادة التنظيم (المراحل ١+٢+٣ مكتملة)

> 📖 **للفهرس التفصيلي** (كل دالة وكل إجراء API وكل صفحة): راجع [INDEX.md](./INDEX.md)

## الخريطة العامة

```
tolanworkforce-main/
├── client/                  # الواجهة الأمامية (React + Vite)
│   └── src/
│       ├── pages/           # صفحات التطبيق (~45 صفحة)
│       ├── components/      # المكونات المشتركة + ui (shadcn)
│       ├── hooks/           # React hooks مخصصة
│       ├── contexts/        # سياقات React (اللغة، إلخ)
│       ├── i18n/            # الترجمات
│       ├── lib/ + utils/    # أدوات مساعدة
│       └── _core/           # نواة العميل (لا تعدَّل يدوياً غالباً)
│
├── server/                  # الخادم (Node + tRPC)
│   ├── _core/               # نواة الخادم: index.ts (نقطة التشغيل)، trpc، security...
│   ├── __tests__/           # ✅ جميع اختبارات الخادم (50 ملف) — نُقلت هنا
│   ├── db.ts                # ✅ ملف barrel (49 سطراً) يعيد تصدير وحدات db/
│   ├── db/                  # ✅ طبقة قاعدة البيانات مقسمة (44 وحدة domain)
│   │   ├── connection.ts    # getDb, getRawConnection, pool (الحالة المشتركة)
│   │   ├── _shared.ts       # مساعدات مشتركة (getActorLabel...)
│   │   ├── audit.ts, users.ts, roles.ts, groups.ts, workers.ts,
│   │   ├── attendance.ts, daily-finance.ts, payroll-batches.ts,
│   │   ├── financial-reports.ts, backup.ts ... (وحدة لكل مجال)
│   ├── routers.ts           # ✅ ملف barrel يعيد تصدير appRouter
│   ├── routers/             # ✅ مسارات tRPC مقسمة (32 راوتر + index.ts المجمّع)
│   │   ├── index.ts         # يجمّع appRouter (+ system و dbQuery)
│   │   ├── auth.ts, users.ts, workers.ts, groups.ts, attendance.ts,
│   │   ├── payroll.ts, export.ts, backup.ts ... (راوتر لكل مجال)
│   ├── permissions.ts       # نظام الصلاحيات
│   ├── storage.ts, middleware.ts, validation.ts, ...
│   └── fonts/               # خطوط تقارير PDF
│
├── shared/                  # أنواع وثوابت مشتركة بين client/server
├── drizzle/                 # مخطط قاعدة البيانات + الهجرات
│
├── scripts/                 # ✅ سكربتات مستقلة (نُقلت من الجذر)
│   ├── diagnostics/         # سكربتات فحص وتحقيق (analyze_*, check_*, investigate_*, query_*)
│   ├── maintenance/         # صيانة وتشغيل يدوي (cleanup_*, recalculate_*, migrate, seed)
│   ├── sql/                 # ملفات SQL يدوية
│   └── backfill-work-dates.ts
│
├── docs/                    # ✅ التوثيق (نُقل من الجذر)
│   ├── STRUCTURE.md         # هذا الملف
│   ├── todo.md              # سجل المهام التاريخي
│   ├── notifications_plan.md
│   └── project_analysis_report.md
│
├── patches/                 # ترقيعات الحزم (patch-package)
└── (ملفات الإعدادات في الجذر: package.json, tsconfig, vite, vitest, drizzle.config)
```

## ما الذي تغيّر في المرحلة ١؟

| قبل | بعد | ملاحظات |
|-----|-----|---------|
| 30 سكربت تشخيص في الجذر | `scripts/diagnostics/` و `scripts/maintenance/` | غير مستوردة من الكود — نقل آمن |
| ملفات `.sql` في الجذر | `scripts/sql/` | |
| `todo.md` وخطط في الجذر | `docs/` | |
| 50 ملف `*.test.ts` داخل `server/` مباشرة | `server/__tests__/` | حُدِّثت الاستيرادات النسبية (`./db` → `../db`) |
| `server/seed-comprehensive-data.mjs` | `scripts/maintenance/` | حُدِّث مساره لـ db |

## ضمانات السلامة (تم التحقق)

- ✅ `tsc --noEmit`: مطابقة 100% للنسخة الأصلية (لا أخطاء جديدة)
- ✅ `vitest list`: 49/50 اختبار مكتشف (الملف الخمسون `local-auth.test.ts` معطَّل عمداً بـ `skip: true` من قبل التعديلات أصلاً)
- ✅ لم يُعدَّل أي منطق كود — نقل وتصحيح مسارات فقط

## ما الذي تغيّر في المرحلة ٢؟ (تقسيم db.ts)

- `server/db.ts` (10,037 سطراً / 220 دالة) → **44 وحدة domain** داخل `server/db/` + ملف barrel
- **نمط Barrel:** `db.ts` أصبح يعيد التصدير فقط — الملفات الـ36 المستوردة لم تُمسّ إطلاقاً
- **تعديلان ميكانيكيان وحيدان:** الدالتان الداخليتان `getActorLabel` و `transformGroup` أُضيف لهما `export` لتستوردهما الوحدات الشقيقة، وتصحيح مسارات الاستيراد الديناميكي (`../drizzle` → `../../drizzle`)

### ضمانات سلامة المرحلة ٢ (تم التحقق)
- ✅ مطابقة كل أسطر الكود سطراً بسطر (الفروق الوحيدة: مسارات + كلمة export)
- ✅ تحميل runtime كامل لشجرة الوحدات نجح (222 رمزاً مصدراً)
- ✅ **حزمة الاختبارات: 600 اختبار بنتائج متطابقة اسمياً 100%** مع النسخة الأصلية
- ✅ `npm run build` الإنتاجي نجح (dist/index.js)
- ℹ️ الاستيرادات الدائرية بين الوحدات هي نفس دائرية الأصل (attendance-logic ↔ db) عبر الـbarrel — آمنة لأنها استدعاءات دوال وقت التشغيل فقط
- ℹ️ أخطاء `tsc` الخاصة بـ`InsertUser/User/Group...` قديمة (المطور الأصلي يستورد أنواعاً غير مصدَّرة من drizzle/schema) — تضاعف ظهورها لأن الاستيراد تكرر في الوحدات، لكنها لا تؤثر على التشغيل

## ملاحظة للمطور

الأخطاء الظاهرة في `tsc` (616 سطراً في `client/`) **موجودة مسبقاً** في المشروع قبل إعادة التنظيم وليست ناتجة عنها.

## ما الذي تغيّر في المرحلة ٣؟ (تقسيم routers.ts)

- `server/routers.ts` (4,877 سطراً / 34 مدخلاً) → **32 وحدة راوتر** داخل `server/routers/` + مجمّع `index.ts` + barrel
- `system` (مرجع لـ systemRouter) و `dbQuery` (إجراء مفرد) بقيا حرفياً في المجمّع
- التعديلات الميكانيكية الوحيدة: سطر بداية كل راوتر (`name: router({` → `export const nameRouter = router({`)، سطر إغلاقه (`}),` → `});`)، وتصحيح مسارات الاستيراد

### ضمانات سلامة المرحلة ٣ (تم التحقق)
- ✅ مطابقة أسطر الكود: 77 فرقاً فقط، كلها مفسرة (32 بداية + 32 إغلاق + 13 مسار استيراد)
- ✅ تحميل runtime: appRouter يعمل بـ34 مساراً علوياً مطابقة للأصل
- ✅ **600 اختبار بنتائج متطابقة اسمياً 100%** مع النسخة الأصلية
- ✅ `npm run build` الإنتاجي نجح
- ℹ️ كتلة الاستيرادات الأصلية نُسخت كاملة لكل وحدة (استيرادات غير مستخدمة في بعض الوحدات — ضجيج غير مؤذٍ، تنظيفها اختياري مستقبلاً)
