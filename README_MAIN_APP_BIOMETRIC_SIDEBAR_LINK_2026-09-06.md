# Main App — Biometric Unit Sidebar Link

Date: 2026-09-06

This update adds a sidebar item named **وحدة البصمة / Biometric Unit** to the main application.

Behavior:
- The item appears under Attendance Management.
- Clicking it opens the existing standalone biometric-service admin UI at `http://127.0.0.1:9096` in a new browser tab.
- The biometric-service remains fully standalone; none of its UI or device logic is copied into the main app.
- No database schema, SQL, migration, `.env`, Final Events importer, or biometric-service files are changed.
- The item follows the main app's existing role/path filtering. Because `/biometric-service` is not added to any non-super-admin role allow-list, it is visible to `super_admin` only in this update.
- Device `mode=test` is unchanged.

Files changed:
- `client/src/components/DashboardLayout.tsx`
- `client/src/i18n/translations.ts`

Apply by extracting this ZIP over the main project root and allowing these two files to be replaced.
