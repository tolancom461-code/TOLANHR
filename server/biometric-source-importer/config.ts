import { BiometricSourceImportError, type SourceImportConfig } from './types';

export function validateStreamId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  return value.toLowerCase();
}

export function validateCursor(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > BigInt('18446744073709551615')) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CURSOR_INVALID');
  }
  return value;
}

export function validateSourceOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  let url: URL;
  try { url = new URL(value); }
  catch { throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID'); }
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  return url.origin;
}

/** Explicit input only. Importing this module does not read environment files or start a consumer. */
export function readBiometricSourceImportConfig(env: Record<string, string | undefined>): SourceImportConfig | null {
  if (env.BIOMETRIC_SOURCE_IMPORT_ENABLED !== 'true') return null;
  const token = env.BIOMETRIC_SOURCE_API_TOKEN;
  const expectedDatabase = env.ATTENDANCE_SOURCE_DB_CONFIRMED_NAME;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(token)
    || typeof expectedDatabase !== 'string' || !/^[A-Za-z0-9_]+$/.test(expectedDatabase)) {
    throw new BiometricSourceImportError('BIOMETRIC_SOURCE_CONFIG_INVALID');
  }
  return Object.freeze({ apiUrl: validateSourceOrigin(env.BIOMETRIC_SOURCE_API_URL), token,
    streamId: validateStreamId(env.BIOMETRIC_SOURCE_STREAM_ID), expectedDatabase,
    intervalMs: 30_000, pageSize: 100, maxPages: 5 });
}
