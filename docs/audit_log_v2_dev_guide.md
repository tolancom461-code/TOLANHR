# 🔧 دليل تحويل راوتر إلى audit_log_v2

> للمرجع المعماري الكامل راجع [audit_log_v2.md](./audit_log_v2.md)
> للحالة الحيّة لكل راوتر راجع [audit_log_v2_todo.md](./audit_log_v2_todo.md)

هذا الدليل يشرح النمط الموحَّد المطبَّق فعلياً على `deletePunchEvent` (في `attendance.ts`) وكل عمليات `users.ts`، لاستخدامه كقالب عند تحويل أي عملية `logAudit` قديمة متبقية.

---

## الخطوات الست لأي عملية

### 1. اجلب الحالة "قبل" العملية (لو تعديل أو حذف)
```ts
const oldRecord = await db.getXById(id);
if (!oldRecord) throw new TRPCError({ code: 'NOT_FOUND', ... });
```

### 2. لو العملية حذف/رفض/تعطيل/تغيير دور — أضِف `reason` إلزامياً بالـ input
```ts
.input(z.object({
  id: z.number(),
  reason: z.string().min(1, 'السبب إلزامي'),
}))
```
> تحقّق من أن الواجهة الأمامية ترسل `reason` فعلاً قبل التحويل (أو حدّثها بنفس الوقت — راجع مثال `Users.tsx`: `window.prompt` كحل سريع).

### 3. لو أي دالة `db/*.ts` تُستدعى داخل العملية تحتاج تنفَّذ داخل نفس المعاملة، أضِف لها باراميتر `tx` اختياري
```ts
export async function updateSomething(id: number, data: any, tx?: any) {
  const database = tx ?? (await getDb());
  ...
}
```
هذا تغيير بسيط ومتوافق للخلف — أي كود قديم يستدعيها بدون `tx` يستمر يعمل بلا تغيير.

### 4. لفّ كل شيء بمعاملة واحدة
```ts
const database = await db.getDb();
if (!database) throw new Error('Database not available');

await database.transaction(async (tx: any) => {
  // أ) تنفيذ العملية الفعلية
  await db.updateSomething(id, data, tx);
  // أو: await tx.delete(table).where(eq(table.id, id));

  // ب) السجل القديم (فترة التشغيل المزدوج)
  await db.logAudit({
    userId: ctx.user!.id,
    action: 'ACTION_NAME',
    tableName: 'table_name',
    recordId: id,
    oldValues: {...},
    newValues: {...},
    tx,
  });

  // ج) السجل الجديد
  await db.logAuditV2({ /* راجع القسم التالي */ tx });
});
```

### 5. عبّئ `logAuditV2` بكل الحقول المتاحة
```ts
await db.logAuditV2({
  actionCategory: 'UPDATE',           // CREATE|UPDATE|DELETE|RESTORE|APPROVE|REJECT|
                                       // ACTIVATE|DEACTIVATE|ARCHIVE|ASSIGN|TRANSFER|
                                       // IMPORT|EXPORT|RECALCULATE|
                                       // GRANT_PERMISSION|REVOKE_PERMISSION|CHANGE_ROLE
  actionName: 'ACTION_NAME',          // نفس اسم العملية بالسجل القديم غالباً
  description: `${actorName} قام بـ...`,   // جملة عربية جاهزة للعرض المباشر
  tableName: 'table_name',
  entityType: 'worker' /* أو attendance, payroll, user... */,
  recordId: id,
  recordKey: { code: oldRecord.code },      // كودات ثابتة تُستخدم بالبحث لاحقاً
  actor: db.actorFromUser(ctx.user),
  source: 'WEB',
  req: ctx.req,
  requestId: ctx.requestId,
  beforeValues: {...} /* أو null للإنشاء */,
  afterValues: {...} /* أو null للحذف */,
  changedFields: db.diffChangedFields(before, after) /* أو اتركها فتُحسب تلقائياً */,
  reasonText: input.reason /* لو موجودة */,
  recordCreatedAt / recordUpdatedAt / recordDeletedAt: new Date().toISOString(),
  tx,
});
```

**لا تنسَ:**
- `beforeValues`/`afterValues` يجب أن يحتويا الأسماء والكودات (وليس فقط المعرّفات الرقمية) — الكيان المرتبط قد يُحذف لاحقاً.
- لو `actionCategory` ضمن `DELETE, RESTORE, REJECT, DEACTIVATE, ARCHIVE, GRANT_PERMISSION, REVOKE_PERMISSION, CHANGE_ROLE, TRANSFER` ولم تُمرَّر `reasonText` → `AuditService` يرمي خطأ تلقائياً، فتأكد أن الـ input يفرضها بالـ zod schema.

### 6. تحقّق نحوياً قبل التسليم
```bash
# فحص syntax سريع (لا يحتاج تثبيت كامل الاعتماديات)
node -e "require('esbuild').buildSync({entryPoints:['server/routers/FILE.ts'], outfile:'/tmp/x.js', bundle:false, format:'esm', platform:'node', target:'node18'})"
```
والأفضل: شغّل فحص الأنواع الكامل عندك بالمشروع (`npm run check` أو ما يعادله) قبل الدمج النهائي.

---

## مثال مرجعي كامل (من `deletePunchEvent`)

```ts
deletePunchEvent: protectedProcedure
  .input(z.object({
    eventId: z.number(),
    reason: z.string().min(1, 'سبب حذف بصمة الحضور إلزامي'),
  }))
  .use(requirePermissionFlag('canEditAttendanceLog'))
  .mutation(async ({ input, ctx }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    const { attendanceEvents } = await import('../../drizzle/schema');
    const database = await db.getDb();
    if (!database) throw new Error('Database not available');

    const { eq } = await import('drizzle-orm');
    const [oldEvent] = await database.select().from(attendanceEvents)
      .where(eq(attendanceEvents.id, input.eventId)).limit(1);
    if (!oldEvent) throw new Error('سجل الحضور غير موجود أو تم حذفه مسبقاً');

    const worker = await db.getWorkerById(oldEvent.workerId);
    const workerName = worker?.fullName || `عامل رقم ${oldEvent.workerId}`;
    const workerCode = worker?.code || null;
    const eventTypeLabel = oldEvent.eventType === 'check_in' ? 'حضور' : 'انصراف';
    const actorName = ctx.user.fullName || ctx.user.username;

    const beforeSnapshot = {
      id: oldEvent.id, workerId: oldEvent.workerId, workerCode, workerName,
      eventType: oldEvent.eventType, eventTime: oldEvent.eventTime,
      workDate: oldEvent.workDate, method: oldEvent.method,
      note: oldEvent.note, isAutomatic: oldEvent.isAutomatic, createdAt: oldEvent.createdAt,
    };

    await database.transaction(async (tx: any) => {
      await tx.delete(attendanceEvents).where(eq(attendanceEvents.id, input.eventId));

      await db.logAudit({
        userId: ctx.user!.id, action: 'DELETE_ATTENDANCE', tableName: 'attendance_events',
        recordId: input.eventId,
        oldValues: { workerId: oldEvent.workerId, workerName, eventType: oldEvent.eventType, eventTime: oldEvent.eventTime },
        newValues: { reason: input.reason },
        tx,
      });

      await db.logAuditV2({
        actionCategory: 'DELETE',
        actionName: 'DELETE_ATTENDANCE',
        description: `${actorName} قام بحذف بصمة ${eventTypeLabel} للعامل ${workerName}${workerCode ? ` (${workerCode})` : ''} - السبب: ${input.reason}`,
        tableName: 'attendance_events',
        entityType: 'attendance',
        recordId: input.eventId,
        recordKey: { workerId: oldEvent.workerId, workerCode, eventType: oldEvent.eventType },
        actor: db.actorFromUser(ctx.user),
        source: 'WEB',
        req: ctx.req,
        requestId: ctx.requestId,
        beforeValues: beforeSnapshot,
        afterValues: null,
        reasonText: input.reason,
        businessEventAt: oldEvent.eventTime,
        recordDeletedAt: new Date().toISOString(),
        tx,
      });
    });

    return { success: true, message: 'تم حذف البصمة بنجاح' };
  }),
```

---

## أخطاء شائعة يجب تجنّبها
- ❌ استدعاء `db.logAuditV2` **خارج** `database.transaction()` — يفقد الذرية.
- ❌ نسيان تمرير `tx` لدالة `db/*.ts` الداخلية — تُنفَّذ خارج المعاملة فعلياً حتى لو استُدعيت داخل الـ callback.
- ❌ وضع `password`/`passwordHash` داخل `beforeValues`/`afterValues` يدوياً كنص — `AuditService` يحذفها تلقائياً، لكن الأفضل عدم تضمينها بالكائن أصلاً.
- ❌ نسيان تحديث الواجهة الأمامية عند إضافة `reason` إلزامية جديدة — يكسر الزر فوراً بخطأ validation.
- ❌ اعتماد فقط على `recordId` بدون `recordKey` — لو حُذف السجل لاحقاً يصعب البحث عنه بدون كود/اسم ثابت.
