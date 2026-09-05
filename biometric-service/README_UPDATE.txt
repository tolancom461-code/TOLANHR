Biometric Service v0.15.1 update

- Reporting semantics fix only; no database schema change.
- Removed the misleading completion-rate percentage from System Health. Historical canonical test punches can legitimately exist without Final Events because automatic historical backfill remains disabled.
- Resolved automatic_finalization_pending intents are internal durability markers and are no longer counted/displayed as operational problems in reports. An open pending intent remains visible because it can require attention.
- No UI theme changes, no main-app integration, no worker_id, no biometric templates/images/passwords/raw sensitive payloads.
- Keep device mode=test.
