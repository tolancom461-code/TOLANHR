# Biometric Service Architecture

## Status

`biometric-service/` is a fully isolated application inside the repository. Current service version is **0.12.2**. The real ZKTeco SpeedFace-V5L has connected successfully and produced real ADMS traffic and real ATTLOG events.

The system is still **not integrated** with the existing workforce application. It now uses TiDB only through its own ten `biometric_svc_*` tables.

## Non-negotiable boundary

During the standalone biometric phase:

- no imports from `../server`, `../client`, `../shared`, or the old biometric prototype;
- no attendance API calls;
- no writes to `workers`, `attendance_events`, finance, shifts, QR, or any current business table;
- no root-application startup dependency;
- no automatic migration;
- database access is isolated to the ten `biometric_svc_*` tables and never runs DDL;
- failure of `biometric-service` must have zero effect on the existing application.

## Multi-device / multi-vendor core

The common core is vendor-neutral. Hardware-specific behavior lives in adapters.

```text
Terminal(s)
   ↓
Vendor adapter (parse + privacy gate + vendor dedupe identity)
   ↓
Sanitized observation
   ↓
Durable ingest store
   ↓
ACK eligibility boundary
   ↓
Canonical punch processing
   ↓
Standalone punch store / diagnostics
```

Current adapter:

```text
src/infrastructure/vendors/zkteco/
```

Future vendors receive separate adapters; vendor-specific numeric meanings must not leak into the common core.

## Canonical device identity

Architectural identity:

```text
vendor + serialNumber
```

Example:

```text
zkteco:AJE1261900133
```

This is enforced by `biometric_svc_devices` with a unique `(vendor, serial_number)` key. The legacy serial-only biometric table was removed manually after it was verified empty and unreferenced at the database level.

## Proven ZKTeco protocol path

The SpeedFace-V5L uses:

- ADMS / PUSH protocol;
- HTTP endpoint on the isolated service port `9095`;
- `GET /iclock/cdata?...options=all...` negotiation;
- `POST /iclock/cdata?table=OPTIONS` capability profile;
- `GET /iclock/getrequest` polling;
- `POST /iclock/cdata?table=OPERLOG` for operation logs;
- `POST /iclock/cdata?table=ATTLOG` for attendance transactions.

Port `4370` remains the device's traditional TCP/SDK communication port. It is not the ADMS service port used by this test.

## ATTLOG model

Every valid real ATTLOG line observed so far has ten tab-separated fields. v0.7 no longer persists the raw ATTLOG line in new durable-ingest/canonical records; it keeps a wire hash, safe parsed fields, byte/field counts, and conservatively classified numeric extra fields.

The two proven semantic dimensions are:

- `rawStatus`: punch state selected on the terminal;
- `rawVerify`: verification method used by the terminal.

These mappings are device/firmware compatibility knowledge owned by the ZKTeco adapter, not universal core assumptions. See `biometric/09_ATTLOG_FIELD_MAPPING.md`.

## Privacy boundary

The observer may retain attendance transaction evidence. It must not retain biometric templates or credential material.

For OPERLOG:

- safe user metadata may be retained;
- passwords and card numbers are redacted;
- FP/FACE/PALM/VEIN/BIODATA/BIOPHOTO/USERPIC payload values are discarded;
- unknown unsafe record shapes are not persisted raw.

## Persistence boundary

Production/default persistence is now TiDB-backed:

```text
biometric_svc_ingest_events      # durable sanitized inbox / ACK boundary
biometric_svc_event_processing   # processing and retry state
biometric_svc_punches            # canonical punches
biometric_svc_devices            # device registry/metadata
biometric_svc_device_users       # safe device-user metadata
biometric_svc_people             # standalone biometric people
biometric_svc_person_device_users# identity mapping
biometric_svc_final_events       # immutable integration-ready events
biometric_svc_finalization_issues# unresolved finalization review
biometric_svc_audit_log          # safe administrative audit
```

The runtime never runs DDL. Before listening, it performs read-only checks for the selected database, required columns, table collation, and critical idempotency indexes. Database failure does not fall back silently to files. Historical file captures remain preserved for lab evidence only.

## Integration gate

No Bridge to attendance is allowed until:

1. the standalone service is completed and tested;
2. database reconciliation is explicitly approved;
3. the legacy biometric cleanup gate is completed;
4. the existing application is regression-tested;
5. a new explicit approval is given for integration.


## Local administration boundary (v0.12.0)

The device-facing server remains on `BIOMETRIC_PORT` (default `9095`). Administration uses a separate listener on `BIOMETRIC_ADMIN_PORT` (default `9096`) and is restricted to loopback in v0.12.0. The administration UI/API reads and writes only service-owned biometric tables through the standalone application services.

The UI defaults to Arabic/RTL and can switch to English/LTR without restarting the service. CSS uses logical alignment for interface structure; person/device codes, serial numbers, and timestamps are isolated LTR so language switching cannot make technical identifiers ambiguous.

No administration route reads or writes the main application. No bridge is created by v0.12.0.


## v0.12.1 TiDB read compatibility

The local administration read stores validate pagination as bounded integers and emit those LIMIT/OFFSET values as SQL literals instead of prepared-statement parameters. All user/search values remain parameterized. This avoids TiDB/mysql2 prepared LIMIT argument incompatibility while preserving injection safety. No schema or architecture boundary changes were made.


## v0.12.2 post-mapping re-finalization

After a local administrator maps an unresolved device user, the administration application retries only that device user's open `unmapped_device_user` punch IDs through the same `FinalizationService.finalizePunchById(...)` boundary used elsewhere. Successful finalization creates or reuses the idempotent Final Event and resolves open issues for that source punch. The database schema and isolation boundary are unchanged.

## v0.13.0 Final Events integration boundary

The standalone service now contains an opt-in, versioned read-only Final Events API on a dedicated listener. This is an internal standalone milestone, not a main-application bridge.

The API reads only `biometric_svc_final_events` rows whose status is `final`. Its public v1 event schema contains only the Final Event UUID, biometric person code, canonical event type/time/timezone, canonical verification method, and finalization version. It deliberately excludes internal person IDs, source punch IDs, device/vendor identifiers, raw metadata, and all biometric/credential material.

The listener defaults to `127.0.0.1:9097`, is disabled by default, refuses non-loopback hosts in this release, and requires an independent Bearer credential for event reads. No write endpoint exists. Remote exposure, TLS termination, network allowlisting, and bridge deployment remain separate future approval gates.
