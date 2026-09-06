# Biometric Documentation — TolanWorkforce

**Last verified:** 2026-08-31  
**Current standalone service:** `biometric-service` v0.14.0 (v0.9.4 remains the closed ingest/canonical baseline)  
**Real terminal:** ZKTeco SpeedFace-V5L / ZAM230  
**Database:** TiDB Serverless (`test`)  
**Safety state:** standalone phase complete; main attendance/finance/QR integration not started.

## Authoritative current documents

1. `biometric/19_FINAL_CLOSURE_REPORT_2026-08-31.md`
2. `biometric/01_CURRENT_STATUS.md`
3. `biometric/README.md`
4. `ARCHITECTURE.md`
5. `biometric/09_ATTLOG_FIELD_MAPPING.md`
6. `biometric/15_DATABASE_RUNTIME_INTEGRATION_2026-08-30.md`
7. `biometric/18_V0.9.4_ACCEPT_EVENTS_FROM_UTC_FIX_2026-08-31.md`
8. `biometric/04_EXECUTION_CHECKLIST.md`

## Historical/protocol documents

Upgrade notes and earlier phase documents are retained as historical evidence. Statements such as "DB pending" in an older dated document describe the state at that time and are superseded by the final closure report.

## Absolute rules

- Actual TiDB is the database source of truth.
- No automatic migration/DDL.
- No main-app imports or writes from the standalone service.
- No biometric templates/images, passwords, or card credential material in durable storage.
- The current real device remains operationally in `mode=test` until a separately approved main-application integration phase begins.

- خطة المرحلة التالية: `biometric/20_STANDALONE_BIOMETRIC_SYSTEM_EXECUTION_PLAN_2026-08-31.md` — بناء نظام البصمة المستقل الكامل وFinal Events قبل أي Main-App Bridge.

## v0.10.0 standalone management foundations

See `UPGRADE_V0.9.4_TO_V0.10.0.md` and `biometric/20_STANDALONE_BIOMETRIC_SYSTEM_EXECUTION_PLAN_2026-08-31.md`.


## v0.12.0 local bilingual administration

The standalone service now includes a loopback-only administration UI at `127.0.0.1:9096` by default. Arabic is default with RTL layout; English switches the same screens to LTR. The UI exposes simple operational concepts only and does not integrate with the main workforce application. See `UPGRADE_V0.11.1_TO_V0.12.0.md`.


## v0.12.1 TiDB administration-read hotfix

`v0.12.1` keeps the v0.12.0 UI unchanged and fixes TiDB/mysql2 pagination compatibility in the standalone administration read layer. No database migration or main-application integration is introduced.


## v0.12.2 mapping re-finalization hotfix

`v0.12.2` fixes the post-mapping retry call in the standalone administration service so it invokes `FinalizationService.finalizePunchById(...)`. This is an application-only hotfix: no schema change, no UI-theme change, no automatic historical backfill, and no main-app integration.


## v0.14.0 durable automatic Finalization retry

`v0.14.0` adds a durable pending intent for every newly inserted canonical punch while automatic Finalization is active, plus bounded retry of only those intents after transient Finalization failures. It uses the existing Finalization Issues table, requires no SQL/DDL, preserves the no-historical-backfill gate, keeps the current UI theme, and does not connect to the main application. See `UPGRADE_V0.13.1_TO_V0.14.0.md`.

- `UPGRADE_V0.16.0_TO_V0.17.0.md` — controlled manual historical Final Event reprocessing; no automatic backfill.
- `UPGRADE_V0.17.1_TO_V0.18.0.md` — optional outbound HTTPS Final Events bridge to the main web application; no automatic historical backfill.
