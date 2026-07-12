# تقرير تحليل مشروع TolanWorkforce

## 1. مقدمة

تم استنساخ وتحليل مستودع GitHub الخاص بمشروع `TolanWorkforce` لفهم بنيته التقنية، والتقنيات المستخدمة، وحالته الحالية بناءً على ملف `todo.md`.

## 2. نظرة عامة على المشروع

مشروع `TolanWorkforce` هو تطبيق ويب حديث مبني باستخدام TypeScript، ويتبع بنية متكاملة (full-stack) تتضمن واجهة أمامية (frontend) وواجهة خلفية (backend).

## 3. البنية التقنية (Technical Architecture)

### 3.1. الواجهة الأمامية (Frontend)

*   **إطار العمل (Framework):** React [^1]
*   **أداة البناء (Build Tool):** Vite [^2]
*   **اللغة:** TypeScript [^3]
*   **مكتبة المكونات (UI Library):** Radix UI [^4] (مع العديد من المكونات مثل Accordion, AlertDialog, Avatar, Checkbox, Dialog, DropdownMenu, إلخ).
*   **إدارة الحالة (State Management):** @tanstack/react-query [^5] و tRPC/react-query [^6] مما يشير إلى استخدام tRPC [^7] للتواصل الآمن والمحدد الأنواع بين الواجهتين الأمامية والخلفية.
*   **التصميم (Styling):** Tailwind CSS [^8] (مذكور في `devDependencies` و `postcss`, `tailwindcss`).
*   **التوجيه (Routing):** Wouter [^9].

### 3.2. الواجهة الخلفية (Backend)

*   **إطار العمل (Framework):** Express [^10] (مذكور في `dependencies` و `@types/express`).
*   **اللغة:** TypeScript [^3] (يتم تشغيله باستخدام `tsx` في وضع التطوير و `esbuild` للبناء).
*   **قاعدة البيانات (Database):** Drizzle ORM [^11] (مع دعم لـ MySQL/TiDB عبر `mysql2` [^12] و PostgreSQL عبر `pg` [^13] و `postgres` [^14]).
*   **المصادقة (Authentication):** `bcryptjs` [^15] لتشفير كلمات المرور و `jsonwebtoken` [^16] و `jose` [^17] لإدارة الـ JWTs، مما يشير إلى نظام مصادقة قائم على الرموز.
*   **خدمات إضافية:**
    *   `@aws-sdk/client-s3` [^18] و `@aws-sdk/s3-request-presigner` [^19] مما يشير إلى استخدام AWS S3 لتخزين الملفات.
    *   `exceljs` [^20] و `xlsx` [^21] لمعالجة ملفات Excel.
    *   `pdfkit` [^22] لإنشاء ملفات PDF.
    *   `qrcode` [^23] و `jsqr` [^24] للتعامل مع رموز QR.

## 4. حالة المشروع الحالية (بناءً على `todo.md`)

يحتوي ملف `todo.md` على قائمة مهام مفصلة، تظهر أن جزءاً كبيراً من الميزات الأساسية قد تم تطويره واختباره. إليك أبرز النقاط:

*   **المحرك البرمجي:** تم الانتهاء من منطق الحساب التلقائي للحضور والمالية، واختبارات `vitest` ناجحة.
*   **الورديات الديناميكية:** تم إضافة حقل `effectiveDate` وتحديث الدوال والواجهة، ولكن **منطق التطبيق التلقائي للورديات عند وصول `effectiveDate` لا يزال معلقاً.**
*   **نظام تسجيل الدخول المحلي:** تم تنفيذه بالكامل.
*   **زر تسجيل الخروج:** تم إضافته.
*   **واجهة إدارة الورديات الأسبوعية:** تم تصميمها وتنفيذها.
*   **إصلاحات وتعديلات:** تم حل العديد من المشاكل المتعلقة بـ `updated_at`، `is_automatic`، دفعة الرواتب، والملاحظات النصية.
*   **تعديل سجل الحضور اليومي:** تم تطوير واجهة ووظيفة التعديل.
*   **نظام سجل التدقيق (Audit Log):** تم تنفيذه بالكامل.
*   **تحسين عرض سجل الحضور اليومي:** تم دمج الحضور والانصراف في سجل واحد.
*   **فلترة الحضور حسب التاريخ:** تم إضافتها مع مؤشر بصري للتواريخ المقفلة.
*   **تعديل وظيفة زر "رفض" في مراحل المراجعة:** تم تعديلها لتعيد الدفعة إلى حالة المسودة.
*   **مهام معلقة رئيسية:**
    *   **منطق التطبيق التلقائي للورديات عند وصول `effectiveDate`**.
    *   **إعادة بناء صفحة إنشاء دفعة رواتب من الصفر بشكل بسيط**.
    *   **إضافة procedure `recalculateDailyFinance` في `routers.ts`**.
    *   **إصلاح عدم ظهور زر الحذف على الدفعات المرفوضة**.
    *   **تحليل عدم ظهور البيانات المالية في Batch-2026-02-001 (يحتاج تأكيد من المستخدم للإصلاح)**.

## 5. استراتيجية التطوير (Development Strategy)

بناءً على المعرفة المتاحة، يجب أن يركز تطوير نظام `Tolan` على تجاوز برنامج CAFM في الوظائف والميزات، مع تقليل التركيز على تطوير تطبيق الهاتف المحمول [^25]. يجب أن تكون التحسينات إضافية، أي بناء ميزات جديدة فوق الوظائف الحالية دون تعديل أو حذف المنطق الأساسي. يجب دمج وظيفة السحب والإفلات (drag-and-drop) في الواجهات المناسبة لتعزيز قابلية الاستخدام وتحسين كفاءة النظام وتقديم تجربة مستخدم احترافية [^26].

## 6. الخطوات التالية

الآن بعد أن أصبح لدي فهم جيد للمشروع، يرجى تزويدي بالتحسينات أو الميزات الجديدة التي تود إضافتها، مع الأخذ في الاعتبار المهام المعلقة المذكورة في `todo.md` واستراتيجية التطوير المقترحة.

## 7. المراجع

[^1]: React. (n.d.). *React – A JavaScript library for building user interfaces*. [https://react.dev/](https://react.dev/)
[^2]: Vite. (n.d.). *Vite | Next Generation Frontend Tooling*. [https://vitejs.dev/](https://vitejs.dev/)
[^3]: TypeScript. (n.d.). *TypeScript - JavaScript With Syntax For Types*. [https://www.typescriptlang.org/](https://www.typescriptlang.org/)
[^4]: Radix UI. (n.d.). *Radix UI - Unstyled, accessible components for building high-quality design systems and web apps*. [https://www.radix-ui.com/](https://www.radix-ui.com/)
[^5]: TanStack Query. (n.d.). *TanStack Query*. [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
[^6]: tRPC. (n.d.). *tRPC - Build and consume typesafe APIs with ease*. [https://trpc.io/](https://trpc.io/)
[^7]: tRPC. (n.d.). *tRPC - Build and consume typesafe APIs with ease*. [https://trpc.io/](https://trpc.io/)
[^8]: Tailwind CSS. (n.d.). *Tailwind CSS - A utility-first CSS framework for rapidly building custom designs*. [https://tailwindcss.com/](https://tailwindcss.com/)
[^9]: Wouter. (n.d.). *Wouter - A tiny (1KB) router for React and Preact*. [https://www.npmjs.com/package/wouter](https://www.npmjs.com/package/wouter)
[^10]: Express. (n.d.). *Express - Node.js web application framework*. [https://expressjs.com/](https://expressjs.com/)
[^11]: Drizzle ORM. (n.d.). *Drizzle ORM - TypeScript ORM for SQL databases*. [https://orm.drizzle.team/](https://orm.drizzle.team/)
[^12]: MySQL2. (n.d.). *mysql2 - A fast MySQL client for Node.js*. [https://www.npmjs.com/package/mysql2](https://www.npmjs.com/package/mysql2)
[^13]: PG. (n.d.). *node-postgres - PostgreSQL client for Node.js*. [https://node-postgres.com/](https://node-postgres.com/)
[^14]: Postgres. (n.d.). *Postgres.js - A fast, full-featured PostgreSQL client for Node.js*. [https://github.com/porsager/postgres](https://github.com/porsager/postgres)
[^15]: bcrypt.js. (n.d.). *bcrypt.js - A library to help you hash passwords*. [https://www.npmjs.com/package/bcryptjs](https://www.npmjs.com/package/bcryptjs)
[^16]: jsonwebtoken. (n.d.). *jsonwebtoken - JSON Web Token implementation for Node.js*. [https://www.npmjs.com/package/jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken)
[^17]: JOSE. (n.d.). *JOSE - JSON Object Signing and Encryption for JavaScript*. [https://github.com/panva/jose](https://github.com/panva/jose)
[^18]: AWS SDK for JavaScript. (n.d.). *@aws-sdk/client-s3*. [https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/)
[^19]: AWS SDK for JavaScript. (n.d.). *@aws-sdk/s3-request-presigner*. [https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_s3_request_presigner.html](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/modules/_aws_sdk_s3_request_presigner.html)
[^20]: ExcelJS. (n.d.). *ExcelJS - Read, write and manipulate XLSX files*. [https://github.com/exceljs/exceljs](https://github.com/exceljs/exceljs)
[^21]: SheetJS. (n.d.). *SheetJS - Community Edition*. [https://sheetjs.com/](https://sheetjs.com/)
[^22]: PDFKit. (n.d.). *PDFKit - A JavaScript PDF generation library for Node and the browser*. [https://pdfkit.org/](https://pdfkit.org/)
[^23]: QR Code. (n.d.). *qrcode.js - QR Code generator for JavaScript*. [https://www.npmjs.com/package/qrcode](https://www.npmjs.com/package/qrcode)
[^24]: jsQR. (n.d.). *jsQR - A pure JavaScript QR code reader*. [https://github.com/cozmo/jsQR](https://github.com/cozmo/jsQR)
[^25]: Tolan System Development Strategy: Surpass CAFM and Deprioritize Mobile App.
[^26]: Tolan System Development Strategy: Additive Enhancement and Drag-and-Drop Integration.
