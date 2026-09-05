import { describe, expect, it } from 'vitest';
import { decideBiometricAttendanceEvent } from '../biometric/biometric-attendance-rules';

describe('biometric attendance decision rules', () => {
  it('infers check-in when device status is unknown and no session is open', () => {
    expect(decideBiometricAttendanceEvent('unknown', null)).toEqual({
      action: 'accept',
      eventType: 'check_in',
      isAutomatic: 1,
    });
  });

  it('infers check-out when device status is unknown and a session is open', () => {
    expect(decideBiometricAttendanceEvent('unknown', 'check_in')).toEqual({
      action: 'accept',
      eventType: 'check_out',
      isAutomatic: 1,
    });
  });

  it('respects an explicit device check-in when the sequence is safe', () => {
    expect(decideBiometricAttendanceEvent('check_in', 'check_out')).toEqual({
      action: 'accept',
      eventType: 'check_in',
      isAutomatic: 0,
    });
  });

  it('sends a second explicit check-in to review', () => {
    expect(decideBiometricAttendanceEvent('check_in', 'check_in').action).toBe('review');
  });

  it('sends an explicit check-out without an open session to review', () => {
    expect(decideBiometricAttendanceEvent('check_out', null).action).toBe('review');
  });
});
