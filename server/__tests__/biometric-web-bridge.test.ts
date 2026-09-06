import { describe, expect, it } from 'vitest';
import { parseBiometricWebBridgeBatch } from '../biometric-web-bridge';

const event = {
  eventId: '123e4567-e89b-42d3-a456-426614174000',
  personCode: '900001',
  eventType: 'check_in',
  eventTimeUtc: '2026-09-06T11:50:20Z',
  eventTimeLocal: '2026-09-06T14:50:20',
  eventTimezone: 'Asia/Riyadh',
  verificationMethod: 'fingerprint',
  finalizationVersion: 'v1',
};

describe('parseBiometricWebBridgeBatch', () => {
  it('accepts the safe Final Event contract', () => {
    const parsed = parseBiometricWebBridgeBatch({ apiVersion: 'v1', sourceCursor: '60010', events: [event] });
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].personCode).toBe('900001');
  });

  it('rejects raw or malformed event payloads', () => {
    expect(() => parseBiometricWebBridgeBatch({ apiVersion: 'v1', events: [{ ...event, eventId: 'bad' }] })).toThrow();
    expect(() => parseBiometricWebBridgeBatch({ apiVersion: 'v1', events: [] })).toThrow();
  });
});
