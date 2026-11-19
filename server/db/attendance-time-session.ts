import type { Pool, PoolConnection, QueryError } from 'mysql2';

const configured = new WeakSet<Pool>();

/** Preserve the existing Riyadh-wall-clock contract without changing global/server timezone. */
export function configureAttendanceTimeSession(pool: Pool): void {
  if (configured.has(pool)) return;
  configured.add(pool);
  const initialized = new WeakMap<PoolConnection, Promise<void>>();
  const acquire = pool.getConnection.bind(pool);
  // Gate acquisition itself: a failed SET must reject before application SQL is queued.
  // Drizzle's PromisePool and callback-pool queries both acquire through this method.
  pool.getConnection = callback => {
    acquire((error, connection) => {
      if (error) { callback(error, connection); return; }
      let ready = initialized.get(connection);
      if (!ready) {
        ready = new Promise<void>((resolve, reject) => {
          connection.query({ sql: "SET SESSION time_zone = '+00:00'", timeout: 5000 }, failure => {
            if (failure) reject(new Error('ATTENDANCE_SQL_TIMEZONE_INIT_FAILED'));
            else resolve();
          });
        });
        initialized.set(connection, ready);
      }
      void ready.then(() => callback(null, connection), () => {
        connection.destroy();
        const failure = Object.assign(new Error('ATTENDANCE_SQL_TIMEZONE_INIT_FAILED'),
          { code: 'ATTENDANCE_SQL_TIMEZONE_INIT_FAILED' }) as QueryError;
        callback(failure, undefined as unknown as PoolConnection);
      });
    });
  };
}
