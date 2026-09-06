# Upgrade v0.17.1 -> v0.18.0

`v0.18.0` adds an optional outbound Final Events web bridge for connecting a local biometric site to the main web application.

- Disabled by default.
- No database schema change or migration.
- Production targets must use HTTPS; HTTP is accepted only for localhost testing.
- Uses a dedicated bearer token separate from the loopback Final Events API token.
- Pushes only the safe Final Event contract; no biometric templates, images, passwords, or raw device payloads.
- Keeps a durable local cursor in `var/web-bridge-state.json`.
- The cursor advances only after the complete batch is acknowledged.
- First enable initializes at the current Final Events tail and skips historical events.
- Manual historical reprocessing remains explicit and produces new Final Events that are delivered normally.

See the root `README_BIOMETRIC_WEB_BRIDGE_LOCAL_TEST_2026-09-06.md` for the local-first rollout procedure.
