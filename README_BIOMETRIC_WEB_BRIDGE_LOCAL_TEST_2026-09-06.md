# Biometric Web Bridge — local-first test update (2026-09-06)

This update adds the first production-shaped bridge between the local `biometric-service` and the main web application.

## Architecture

`ZKTeco -> local biometric-service -> outbound HTTP(S) push -> main app -> attendance_events`

The local test uses `http://127.0.0.1:3000`. Production later must use the Railway HTTPS URL.

## Safety boundaries

- No database schema mutation and no migration.
- No biometric templates, images, passwords, device raw payloads, or secrets are sent.
- Only the existing safe Final Event contract is pushed.
- The receiving app uses the existing `event_uuid` idempotency guard and the same attendance/finance logic already tested.
- The outbound bridge has a separate bearer token.
- The bridge never advances its durable cursor until the main app acknowledges the complete batch.
- On first enable it initializes at the current Final Events tail, so old history is not backfilled automatically.
- Manual historical reprocessing still works because reissued Final Events receive new sequence IDs and are pushed normally.
- Production bridge targets must be HTTPS; plain HTTP is accepted only for localhost testing.

## Local test configuration

Run from the project root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-local-biometric-web-bridge.ps1
```

The script generates a new bridge token locally, writes it to both `.env` files without displaying it, enables outbound push in `biometric-service`, and disables the old main-app pull importer so the test exercises only the new architecture.

## Expected startup logs

Main app:

```text
[Biometric Web Bridge] ingest endpoint: enabled
[Biometric Final Events] importer: disabled
```

biometric-service:

```text
[biometric-service] web bridge: enabled (push every 10s)
[biometric-service] web bridge first enable: historical Final Events are skipped by cursor initialization
[biometric-service] web bridge cursor initialized at ...; historical events skipped: ...
```

After a new supported punch:

```text
[Biometric Web Bridge] received 1; results={"processed":1}
[biometric-service] web bridge pushed 1; cursor=...; results={"processed":1}
```

## Not included yet

- Railway URL/variable configuration. That comes only after the localhost bridge test succeeds.
- Person Directory synchronization for Railway worker-link selection. This is a separate follow-up because the current Directory API remains loopback-only.
- Windows automatic service installation. This comes after the bridge is proven locally, per the agreed rollout plan.
- No server-company-machine work yet. After the complete local phase succeeds, the same documented setup will be moved to the company server.
