import { describe, expect, it } from 'vitest';
import {
  normalizeZktecoStatus,
  parseRiyadhLocalDateTime,
  parseZktecoAttLogBody,
} from '../biometric/zkteco-push-parser';

describe('ZKTeco PUSH ATTLOG parser', () => {
  it('parses a normal check-in row', () => {
    const rows = parseZktecoAttLogBody('MB2000-001', '60001\t2026-08-09 07:58:03\t0\t1\t0');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deviceSerial: 'MB2000-001',
      deviceUserId: '60001',
      eventTimeLocal: '2026-08-09 07:58:03',
      normalizedEventType: 'check_in',
      verifyMode: '1',
    });
    expect(rows[0].payloadHash).toHaveLength(64);
  });

  it('parses multiple rows and keeps unsupported states unknown', () => {
    const rows = parseZktecoAttLogBody('SN1', [
      '7\t2026-08-09 07:00:00\t0\t1\t0',
      '7\t2026-08-09 17:00:00\t1\t1\t0',
      '7\t2026-08-09 18:00:00\t5\t1\t0',
    ].join('\n'));
    expect(rows.map(r => r.normalizedEventType)).toEqual(['check_in', 'check_out', 'unknown']);
  });

  it('uses a stable logical hash even when auxiliary work-code changes', () => {
    const a = parseZktecoAttLogBody('SN1', '7\t2026-08-09 07:00:00\t0\t1\tA')[0];
    const b = parseZktecoAttLogBody('SN1', '7\t2026-08-09 07:00:00\t0\t1\tB')[0];
    expect(a.payloadHash).toBe(b.payloadHash);
  });

  it('normalizes only states 0 and 1', () => {
    expect(normalizeZktecoStatus('0')).toBe('check_in');
    expect(normalizeZktecoStatus('1')).toBe('check_out');
    expect(normalizeZktecoStatus('2')).toBe('unknown');
    expect(normalizeZktecoStatus(null)).toBe('unknown');
  });

  it('converts Riyadh local time to UTC correctly', () => {
    const date = parseRiyadhLocalDateTime('2026-08-09 08:15:30');
    expect(date?.toISOString()).toBe('2026-08-09T05:15:30.000Z');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseRiyadhLocalDateTime('2026-02-31 08:15:30')).toBeNull();
  });
});
