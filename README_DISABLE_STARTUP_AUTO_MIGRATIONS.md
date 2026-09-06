# Disable automatic startup schema migrations — 2026-09-05

This update is intentionally narrow.

## Changed file
- `server/_core/index.ts`

## What changed
The application no longer calls these database-schema migration functions automatically when the HTTP server starts:
- `runMigration()`
- `runRoleEnumMigration()`
- `runDeductionsMigration()`
- `runPayOverridesNotesMigration()`

Startup now logs:

`[Migration] Automatic startup migrations: disabled`

## What was NOT changed
- No SQL is included.
- No TiDB schema or data was changed.
- No Drizzle push/migrate command is run.
- Migration helper functions remain in the codebase for explicit/manual use when reviewed.
- The existing manual migration endpoint was not removed.
- No biometric-service file was changed.
- No worker/photo/attendance/payroll logic was changed.

## Verification performed
- Confirmed the four startup migration calls are absent from `server/_core/index.ts`.
- Confirmed periodic memory logging remains enabled.
- Diff against the V02 baseline shows only the startup migration block was replaced by the disabled-status log.
