import type { Pool } from 'mysql2/promise';
import { readSourcePromotionConfig } from './config';
import { createSourceAttendancePromotion } from './coordinator';

const applications = new WeakMap<object, { key: string; promotion: ReturnType<typeof createSourceAttendancePromotion> }>();

/** Shared application pool only. Importing does not connect, arm, or activate processing. */
export function getSourceAttendancePromotion(pool: Pool, env: Record<string,string|undefined> = process.env) {
  const config = readSourcePromotionConfig(env);
  if (!config) return null;
  const key = `${config.database}:${config.streamId}`;
  // mysql2 creates a new promise facade on each .promise() call over the same pool.
  const underlying = (pool as Pool & { pool?: object }).pool;
  const identity = underlying && typeof underlying === 'object' ? underlying : pool;
  const saved = applications.get(identity);
  if (saved?.key === key) return saved.promotion;
  const promotion = createSourceAttendancePromotion({ pool, config });
  applications.set(identity,{ key,promotion });
  return promotion;
}
