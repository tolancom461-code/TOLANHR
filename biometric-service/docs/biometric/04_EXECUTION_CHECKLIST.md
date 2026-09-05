# خطة التنفيذ وبوابات الموافقة — الحالة النهائية للخدمة المستقلة

**آخر تحديث:** 2026-08-31

## المرحلة 0 — العزل

- [x] خدمة مستقلة داخل `biometric-service/`.
- [x] منع imports/runtime dependency على التطبيق الحالي.
- [x] Multi-device architecture.
- [x] Multi-vendor architecture with vendor-neutral core.
- [x] Boundary suite: 4/4 passing.

## المرحلة 1 — الجهاز والاتصال

- [x] ZKTeco SpeedFace-V5L حقيقي.
- [x] ADMS على 9095.
- [x] عنوان الجهاز النهائي `192.168.10.199`.
- [x] DHCP OFF.
- [x] Ping ناجح 2/2.
- [x] Timezone = UTC+03:00 / Asia/Riyadh.
- [x] DST OFF.
- [x] NTP بقي OFF باختيار المشغل.

## المرحلة 2 — البروتوكول والخصوصية

- [x] OPTIONS.
- [x] OPERLOG sanitized.
- [x] ATTLOG real capture.
- [x] منع تخزين templates والصور والـcredentials.
- [x] unknown/unsafe payload fails safe.

## المرحلة 3 — خرائط الجهاز المرجعي

- [x] Fingerprint = rawVerify 1.
- [x] Password = 3.
- [x] Card = 4.
- [x] Face = 15.
- [x] Palm = 25.
- [x] Check-In = rawStatus 0.
- [x] Check-Out = 1.
- [x] Break-Out = 2.
- [x] Break-In = 3.
- [x] Overtime-In = 4.
- [x] Overtime-Out = 5.
- [x] عدم تعميم mappings على Serial آخر بدون اختبار.

## المرحلة 4 — TiDB ownership

- [x] فحص TiDB الفعلية قبل التغيير.
- [x] التحقق أن الجداول القديمة فارغة وغير مرتبطة.
- [x] حذف الجداول القديمة يدوياً بعد الموافقة والفحص.
- [x] إنشاء الجداول الخمسة `biometric_svc_*` يدوياً.
- [x] SHOW CREATE/contract verification.
- [x] runtime لا ينفذ DDL.

## المرحلة 5 — DB runtime

- [x] Durable sanitized ingest.
- [x] Processing state.
- [x] Canonical punch.
- [x] Device registry.
- [x] Device-user observation.
- [x] DB schema validation on startup.
- [x] No automatic fallback to file mode.

## المرحلة 6 — ACK / dedupe / recovery

- [x] no-ACK retry observed on real terminal.
- [x] durable duplicate detection.
- [x] ACK after durable persistence.
- [x] ACK stopped terminal retry on real device.
- [x] startup replay.
- [x] runtime retry sweep without restart.
- [x] non-overlapping retry sweeps.

## المرحلة 7 — timezone والسياسات

- [x] device timezone flows to Punch.
- [x] device local time converts to UTC.
- [x] real Riyadh -> UTC verification.
- [x] `accept_events_from` implemented.
- [x] real v0.9.3 UTC/local comparison defect discovered.
- [x] fixed in v0.9.4.
- [x] real post-fix cutoff test: ingest increased while punch count stayed unchanged.
- [x] `mode=maintenance` produced real `device_policy_rejected`.
- [x] `status=disabled` produced real policy rejections; delayed ATTLOG arrived only after restoring active.
- [x] automated fail-closed coverage for database device policy.

## المرحلة 8 — diagnostics

- [x] bounded log rotation.
- [x] clean active log per service session.
- [x] sessionId per log record.
- [x] UTC + local Riyadh diagnostic timestamps.

## المرحلة 9 — الاختبارات النهائية

- [x] `npm test`: 97/97 pass on v0.9.4.
- [x] architecture boundaries: 4/4 pass.
- [x] real-device DB persistence.
- [x] real-device normalized punch.
- [x] real-device ACK/dedupe.
- [x] real-device timezone/UTC.
- [x] real-device cutoff policy.
- [ ] second physical device — not available; architecture/tests cover multi-device.
- [ ] second physical vendor — not selected; architecture only.
- [ ] terminal QR verification — intentionally not required in this phase.

## المرحلة 10 — إغلاق الخدمة المستقلة

- [x] Final closure report written.
- [x] Device returned to `status=active`.
- [x] Device returned to `mode=test`.
- [x] `accept_events_from=NULL` restored.
- [x] Main application integration remains untouched.

## Gate للمرحلة القادمة

```text
STOP here.
Device mode remains test.
Do not switch to live yet.
Do not connect to workers/attendance/finance/payroll/shifts/QR yet.
```

المرحلة التالية، إذا اعتمدت، هي تصميم Main Application Bridge بموافقة جديدة واختبارات regression مستقلة.
