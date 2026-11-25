import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';
import {
  currentSourceAttendanceDatabase,
  runWithSourceAttendanceDatabase,
  type SourceAttendanceDatabase,
} from '../db/source-execution-context';
import { createSourcePromotionActivation } from './activation';
import { readSourcePromotionConfig, type SourcePromotionConfig } from './config';

interface SourcePayrollGateDependencies {
  readConfig: () => SourcePromotionConfig | null;
  getPool: () => Promise<Pool>;
  createActivation: typeof createSourcePromotionActivation;
  createDatabase: (connection: PoolConnection) => SourceAttendanceDatabase;
  currentDatabase: typeof currentSourceAttendanceDatabase;
  runWithDatabase: typeof runWithSourceAttendanceDatabase;
}

async function applicationPool(): Promise<Pool> {
  // Called before entering the transaction context: this is the original application pool.
  const { getDb } = await import('../db/connection');
  const database = await getDb();
  if (!database) throw new Error('SOURCE_PROMOTION_DATABASE_UNAVAILABLE');
  return database.$client.promise();
}

/** Shares the promotion coordinator's activation-row lock with payroll closure. */
export function createSourcePayrollGate(overrides: Partial<SourcePayrollGateDependencies> = {}) {
  const dependencies: SourcePayrollGateDependencies = {
    readConfig: readSourcePromotionConfig,
    getPool: applicationPool,
    createActivation: createSourcePromotionActivation,
    createDatabase: connection => drizzle({ client: connection }),
    currentDatabase: currentSourceAttendanceDatabase,
    runWithDatabase: runWithSourceAttendanceDatabase,
    ...overrides,
  };
  // An absent activation must execute legacy code after releasing the connection.
  // Its recursive entry hook must not acquire the gate again.
  const legacyFallback = new AsyncLocalStorage<boolean>();

  function shouldUseSourcePayrollGate(): boolean {
    return !dependencies.currentDatabase() && !legacyFallback.getStore() && dependencies.readConfig() !== null;
  }

  async function runWithSourcePayrollGate<T>(operation: () => Promise<T>): Promise<T> {
    if (dependencies.currentDatabase() || legacyFallback.getStore()) return operation();
    const config = dependencies.readConfig();
    if (!config) return operation();

    const pool = await dependencies.getPool();
    const activation = dependencies.createActivation(pool, config);
    const connection = await pool.getConnection();
    let transactionStarted = false;
    let reusable = true;
    let inactive = false;
    let result: T | undefined;
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      transactionStarted = true;
      if (!await activation.read(connection, true)) {
        await connection.rollback();
        transactionStarted = false;
        inactive = true;
      } else {
        const database = dependencies.createDatabase(connection);
        result = await dependencies.runWithDatabase(database, operation);
        await connection.commit();
        transactionStarted = false;
      }
    } catch (error) {
      if (transactionStarted) {
        try { await connection.rollback(); } catch {
          // Never return a possibly open transaction to the shared application pool.
          reusable = false;
          connection.destroy();
        }
      }
      throw error;
    } finally {
      if (reusable) connection.release();
    }
    if (inactive) return legacyFallback.run(true, operation);
    return result as T;
  }

  return Object.freeze({ shouldUseSourcePayrollGate, runWithSourcePayrollGate });
}

const applicationGate = createSourcePayrollGate();
export const shouldUseSourcePayrollGate = applicationGate.shouldUseSourcePayrollGate;
export const runWithSourcePayrollGate = applicationGate.runWithSourcePayrollGate;
