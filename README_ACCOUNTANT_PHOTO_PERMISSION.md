# Worker Photo Permission — Accountant Update
Date: 2026-09-05

Incremental update only. Apply it after the Worker Photo update.

## Change
Adds `accountant` to the roles allowed to upload/replace worker photos.

Allowed roles after this update:
- `admin_affairs`
- `data_entry`
- `accountant`
- `super_admin`
- configured owner override

## Scope
Only these files are replaced:
- `shared/workerPhotoPolicy.ts`
- `server/__tests__/worker-photos.test.ts`

No database changes.
No SQL.
No migration.
No Drizzle push.
No biometric-service changes.
No change to any other accountant permissions.
No worker-photo delete action is added.
