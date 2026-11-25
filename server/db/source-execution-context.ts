import { AsyncLocalStorage } from 'node:async_hooks';
import type { drizzle } from 'drizzle-orm/mysql2';

export type SourceAttendanceDatabase = Pick<ReturnType<typeof drizzle>, 'select' | 'insert' | 'update'>;

const sourceDatabase = new AsyncLocalStorage<SourceAttendanceDatabase>();

/** Keeps existing attendance/finance helpers on the coordinator's transaction. */
export function runWithSourceAttendanceDatabase<T>(
  database: SourceAttendanceDatabase,
  operation: () => Promise<T>,
): Promise<T> {
  return sourceDatabase.run(database, operation);
}

export function currentSourceAttendanceDatabase(): SourceAttendanceDatabase | undefined {
  return sourceDatabase.getStore();
}
