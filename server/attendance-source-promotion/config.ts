import { readBiometricSourceImportConfig } from '../biometric-source-importer/config';

export interface SourcePromotionConfig {
  database: string;
  streamId: string;
  intervalMs: 2000;
  batchSize: 20;
}

export class SourcePromotionConfigError extends Error {
  readonly code = 'SOURCE_PROMOTION_CONFIG_INVALID';
  constructor() {
    super('SOURCE_PROMOTION_CONFIG_INVALID');
    this.name = 'SourcePromotionConfigError';
  }
}

/** Explicit opt-in only; reading configuration never starts processing or creates activation state. */
export function readSourcePromotionConfig(env: Record<string, string | undefined> = process.env): SourcePromotionConfig | null {
  if (env.BIOMETRIC_SOURCE_PROMOTION_ENABLED !== 'true') return null;
  try {
    if (env.BIOMETRIC_SOURCE_IMPORT_ENABLED !== 'true' || env.BIOMETRIC_SOURCE_DIRECTORY_ENABLED !== 'true' ||
        env.ATTENDANCE_SOURCE_QR_ENABLED !== 'true') throw new SourcePromotionConfigError();
    const source = readBiometricSourceImportConfig(env);
    if (!source) throw new SourcePromotionConfigError();
    return Object.freeze({ database: source.expectedDatabase, streamId: source.streamId, intervalMs: 2000, batchSize: 20 });
  } catch { throw new SourcePromotionConfigError(); }
}
