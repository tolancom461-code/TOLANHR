import { describe, expect, it, vi } from 'vitest';
import { readSourcePromotionConfig } from '../attendance-source-promotion/config';

const streamId = '78d31b88-7cc4-4a9d-b8ae-12b621ca7b5f';
const enabled = {
  BIOMETRIC_SOURCE_PROMOTION_ENABLED: 'true', BIOMETRIC_SOURCE_IMPORT_ENABLED: 'true',
  BIOMETRIC_SOURCE_DIRECTORY_ENABLED: 'true', ATTENDANCE_SOURCE_QR_ENABLED: 'true',
  BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example', BIOMETRIC_SOURCE_API_TOKEN: 'synthetic_'.repeat(6),
  BIOMETRIC_SOURCE_STREAM_ID: streamId, ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'SYNTHETIC_DATABASE',
};

describe('attendance source promotion configuration', () => {
  it('is disabled by default and does not inspect unrelated settings while disabled', () => {
    const secret = vi.fn(() => { throw new Error('SYNTHETIC_PRIVATE_VALUE'); });
    for (const flag of [undefined, 'false', 'TRUE', '1', '']) {
      const env = { BIOMETRIC_SOURCE_PROMOTION_ENABLED: flag };
      Object.defineProperty(env, 'BIOMETRIC_SOURCE_API_TOKEN', { get: secret });
      expect(readSourcePromotionConfig(env)).toBeNull();
    }
    expect(secret).not.toHaveBeenCalled();
  });

  it('reuses validated source configuration and returns no credential or activation timestamp', () => {
    const config = readSourcePromotionConfig({ ...enabled, BIOMETRIC_SOURCE_STREAM_ID: streamId.toUpperCase() });
    expect(config).toEqual({ database: 'SYNTHETIC_DATABASE', streamId, intervalMs: 2000, batchSize: 20 });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.keys(config!)).toEqual(['database', 'streamId', 'intervalMs', 'batchSize']);
  });

  it('requires import, directory and QR gates together before promotion can be armed', () => {
    for (const key of ['BIOMETRIC_SOURCE_IMPORT_ENABLED', 'BIOMETRIC_SOURCE_DIRECTORY_ENABLED', 'ATTENDANCE_SOURCE_QR_ENABLED']) {
      for (const value of [undefined, 'false', 'TRUE']) {
        expect(() => readSourcePromotionConfig({ ...enabled, [key]: value })).toThrowError('SOURCE_PROMOTION_CONFIG_INVALID');
      }
    }
  });

  it('rejects invalid existing source configuration through one sanitized configuration error', () => {
    for (const patch of [{ BIOMETRIC_SOURCE_API_TOKEN: 'SYNTHETIC_PRIVATE_TOKEN' },
      { BIOMETRIC_SOURCE_API_URL: 'https://synthetic.example/private?token=SYNTHETIC_PRIVATE_TOKEN' },
      { BIOMETRIC_SOURCE_STREAM_ID: 'invalid' }, { ATTENDANCE_SOURCE_DB_CONFIRMED_NAME: 'wrong database' }]) {
      const error = (() => { try { readSourcePromotionConfig({ ...enabled, ...patch }); } catch (value) { return value; } })();
      expect(error).toMatchObject({ code: 'SOURCE_PROMOTION_CONFIG_INVALID', message: 'SOURCE_PROMOTION_CONFIG_INVALID' });
      expect(String(error)).not.toContain('PRIVATE');
    }
  });
});
