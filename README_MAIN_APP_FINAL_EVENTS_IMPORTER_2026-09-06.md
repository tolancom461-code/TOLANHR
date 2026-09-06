# Main App Final Events Importer — 2026-09-06

## Scope
This update changes the **main workforce application only**. It does not modify `biometric-service` and does not connect the main app directly to the ZKTeco device.

Approved path remains:

`Device -> biometric-service -> Final Events API -> Main App -> attendance_events`

## Database source of truth
The actual TiDB database is the source of truth.

The table `biometric_final_event_imports` was created manually and verified with `SHOW CREATE TABLE` before this code update. `drizzle/schema.ts` only reflects that already-existing table for runtime typing.

**No migration/SQL is included. Do not run Drizzle push/migrate.**

## Import behavior
- Reads only the protected `GET /api/v1/final-events` API using the server-side bearer token.
- Stores the Final Events API cursor in existing `settings` under key `biometric_final_events_cursor`.
- The first time the importer is enabled, it initializes the cursor at the current API tail and **skips historical Final Events**. Existing historical/test events are not backfilled into attendance automatically.
- Every Final Event UUID is recorded in `biometric_final_event_imports`; its unique key is the durable idempotency guard.
- Attendance + import record are written in one DB transaction. If a retry happens before cursor advancement, the same Final Event cannot create a second attendance row.
- Only `check_in` and `check_out` become main attendance rows for now.
- `break_in`, `break_out`, `overtime_in`, `overtime_out`, or any other unsupported Final Event type are retained in the import table as `unsupported_event` and do not change attendance.
- If `personCode` is not linked to a worker, the event is retained as `unmapped`; no guessed attendance is created.
- If the linked worker is inactive, the event is retained as `worker_inactive`; no attendance is created.
- The real `eventTimeUtc` from biometric-service is used; import time is never substituted for punch time.
- Main attendance rows use `method = 'biometric'`.
- QR and biometric coexist. The same worker + same movement type within a 3-minute window is treated as one movement (`duplicate`). A `check_in` and `check_out` remain distinct even if close together.
- `attendance_events.device_id` remains `NULL` for this integration so legacy device IDs are not mixed with biometric-service identifiers.
- On a new biometric `check_out`, the existing daily-finance recalculation is invoked just like the current attendance flow.

## Enablement
The importer is **disabled by default**. Existing Person Directory linking continues to work without enabling it.

When ready for the real attendance test, add this to the main app `.env`:

```text
BIOMETRIC_FINAL_EVENTS_IMPORT_ENABLED=true
```

Optional poll interval (default 10000 ms, minimum 5000 ms):

```text
BIOMETRIC_FINAL_EVENTS_IMPORT_INTERVAL_MS=10000
```

Keep the existing server-only values:

```text
BIOMETRIC_SERVICE_API_URL=http://127.0.0.1:9097/api/v1
BIOMETRIC_SERVICE_API_TOKEN=<local token>
```

Never expose the bearer token through a `VITE_*` variable.

## Startup logging
Disabled:

```text
[Biometric Final Events] importer: disabled
```

First enabled startup:

```text
[Biometric Final Events] importer: enabled (...)
[Biometric Final Events] cursor initialized at ...; historical events skipped: ...
```

After a new event:

```text
[Biometric Final Events] fetched ...; cursor=...; results={...}
```

No bearer token is logged.

## Changed files
- `drizzle/schema.ts`
- `server/biometric-integration.ts`
- `server/biometric-final-events-importer.ts` (new)
- `server/_core/index.ts`
- `server/__tests__/biometric-integration.test.ts`

## Validation performed in build workspace
- Verified the user-provided TiDB `SHOW CREATE TABLE biometric_final_event_imports` result matches the reflected Drizzle definition.
- TypeScript syntax/transpile validation passed for all modified TypeScript files.
- Mock runtime test passed for Final Events bearer-auth request, response validation, event contract, and cursor parsing.
- Full dependency-based `npm test` / `npm run check` could not be run in the isolated build workspace because project `node_modules` are not present there; no dependency installation or upgrade was performed.
