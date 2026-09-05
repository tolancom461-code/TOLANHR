# دليل تشغيل واختبار `biometric-service`

## 1. التشغيل الموثق

من PowerShell:

```powershell
cd "C:\Users\mh\Desktop\01\tolanworkforce\biometric-service"
Remove-Item Env:BIOMETRIC_ACK_MODE -ErrorAction SilentlyContinue
$env:BIOMETRIC_ALLOWED_DEVICES="zkteco:AJE1261900133"
$env:BIOMETRIC_PORT="9095"
$env:BIOMETRIC_ATTLOG_ACK_MODE="observe"
npm start
```

وضع `observe` هو الوضع المحافظ لاكتشاف ATTLOG لأنه لا يرسل success ACK للحركات.

لاختبار ACK بعد التأكد من local durable capture/dedupe:

```powershell
$env:BIOMETRIC_ATTLOG_ACK_MODE="ack"
npm start
```

يجب دائمًا إزالة alias القديم من البيئة حتى لا يسبب غموضًا.

## 2. مؤشرات startup الصحيحة

```text
listening on http://0.0.0.0:9095
allowed devices: 1
active vendor adapters: zkteco
OPTIONS ack policy: acknowledge after safe observation
ATTLOG ack mode: observe|ack
SQL/database integration: service-owned TiDB tables only; automatic DDL disabled
```

## 3. ملفات المراقبة

Service diagnostics:

```powershell
Get-Content ".\var\logs\service.ndjson" -Tail 100
```

From v0.9.3 onward, the active `service.ndjson` contains only the current service session. Previous sessions are rotated to `service.ndjson.1`, `.2`, and so on. Each current record also carries `sessionId`, UTC `occurredAt`, and local `occurredAtLocal` so operators do not confuse an older run with the current one.

ATTLOG captures:

```powershell
Get-Content ".\var\captures\attlog.ndjson" -Tail 10
```

## 4. إيقاف الخدمة

```text
Ctrl+C
```

إيقاف الخدمة المستقلة يجب ألا يؤثر على البرنامج الحالي.

## 5. قواعد الاختبار على الجهاز

- استخدم test user فقط.
- لا تسجل قالب/credential في ملفات المشروع.
- عند اختبار Punch States، اختر الحالة على الجهاز ثم نفذ verification.
- الجهاز لديه Duplicate Punch Period = 1 minute في الإعداد الذي شوهد؛ انتظر أكثر من 60 ثانية بين التجارب المتتالية لنفس المستخدم أو سيعرض Duplicate Punch.
- لا تغير DHCP/firewall/network settings بلا حاجة موثقة.

## 6. خريطة الاختبار المثبتة

```text
Verification:
1 fingerprint
3 password
4 card
15 face
25 palm

Punch states:
0 check-in
1 check-out
2 break-out
3 break-in
4 overtime-in
5 overtime-out
255 unspecified (observed)
```

## 7. Privacy checklist

قبل الاحتفاظ بأي payload:

- هل هو ATTLOG attendance transaction؟ يمكن الاحتفاظ به وفق السياسة.
- هل يحتوي template/image/password/card credential؟ لا يحتفظ بالقيمة.
- هل OPERLOG record معروف ويمكن تنقيحه؟ احتفظ metadata آمنة فقط.
- unknown biometric-like record؟ لا raw persistence ولا success ACK.

## 8. قاعدة ACK

في الإنتاج مستقبلًا: لا success ACK قبل durable persistence أو confirmed durable duplicate.

## 9. قاعدة DB

لا تشغل SQL أو Migration من هذا Runbook. DB changes لها Gate مستقل.
