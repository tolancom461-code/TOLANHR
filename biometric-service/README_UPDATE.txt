biometric-service v0.18.0 outbound web bridge

- Optional outbound Final Events push to the main web application.
- Disabled by default.
- No database schema change or migration.
- Safe first enable: initializes at current tail and skips old history.
- Durable local delivery cursor; advances only after complete acknowledgement.
- Retries safely when the web target is unavailable.
- Production target must be HTTPS; localhost HTTP is allowed only for local testing.
- Local admin UI and read-only API remain loopback-only.
