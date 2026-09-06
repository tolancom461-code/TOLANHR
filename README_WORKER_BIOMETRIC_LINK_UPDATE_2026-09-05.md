# Worker ↔ Biometric Person Link — 2026-09-05

## Scope
This update modifies the **main workforce application only**. It does not modify `biometric-service`.

## What it adds
- Worker field display: **الربط مع نظام البصمة**.
- Selection from the protected `biometric-service` Person Directory API instead of manual code entry.
- Search by biometric person code or name.
- Already-linked biometric people are disabled and show the worker they belong to.
- Link / change link / unlink are persisted through a dedicated server mutation.
- The actual TiDB `workers.biometric_person_code` column and its unique index remain the source of truth.
- Worker search also accepts biometric person code.
- Worker list shows a compact biometric link status.
- Link changes are dual-written to legacy `audit_log` and `audit_log_v2` in the same DB transaction as the worker link update.

## Security / boundaries
- The browser never receives or stores the biometric API bearer token.
- The main server proxies the safe Person Directory contract only.
- The main app does not read any `biometric_svc_*` table.
- No biometric template, image, raw credential, device user ID, or biometric internal `person_id` is stored in the main app.
- Only `personCode` is stored in `workers.biometric_person_code`.
- The database unique index prevents the same biometric person code from being linked to two workers.

## Required main-app environment variables
Configure these in the **main application** environment (server-side only):

```text
BIOMETRIC_SERVICE_API_URL=http://127.0.0.1:9097/api/v1
BIOMETRIC_SERVICE_API_TOKEN=<same local bearer token used by biometric-service read-only API>
```

Do not expose the token through a `VITE_*` variable and do not paste it into client code.

## Database
No migration is included in this package. The required TiDB changes were already executed manually and verified:
- `workers.biometric_person_code VARCHAR(100) NULL`
- unique index `uq_workers_biometric_person_code`

`drizzle/schema.ts` is updated only to reflect that already-existing TiDB state for runtime typing. **Do not run Drizzle push/migrate from this package.**

## Audit actions
- `LINK_WORKER_BIOMETRIC`
- `CHANGE_WORKER_BIOMETRIC_LINK`
- `UNLINK_WORKER_BIOMETRIC`

Audit stores worker/person codes and actor snapshot only; it does not store biometric payloads.
