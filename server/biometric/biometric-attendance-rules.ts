import type { BiometricEventType } from "./zkteco-push-parser";

export type ExistingAttendanceEventType = 'check_in' | 'check_out' | null | undefined;

export type BiometricAttendanceDecision =
  | { action: 'accept'; eventType: 'check_in' | 'check_out'; isAutomatic: 0 | 1 }
  | { action: 'review'; reason: string };

/**
 * Pure business rule used after deduplication.
 *
 * The latest attendance event before the device timestamp represents the
 * session state in the 15-hour lookback window:
 * - latest check_in => an open session exists
 * - latest check_out / no event => no open session
 *
 * A device-selected IN/OUT is respected when it is sequence-safe. Unknown
 * device states fall back to alternating the current session state.
 */
export function decideBiometricAttendanceEvent(
  requestedEventType: BiometricEventType,
  latestExistingEventType: ExistingAttendanceEventType,
): BiometricAttendanceDecision {
  const hasOpenSession = latestExistingEventType === 'check_in';

  if (requestedEventType === 'unknown') {
    return {
      action: 'accept',
      eventType: hasOpenSession ? 'check_out' : 'check_in',
      isAutomatic: 1,
    };
  }

  if (requestedEventType === 'check_in' && hasOpenSession) {
    return {
      action: 'review',
      reason: 'الجهاز أرسل دخولاً بينما توجد جلسة دخول مفتوحة',
    };
  }

  if (requestedEventType === 'check_out' && !hasOpenSession) {
    return {
      action: 'review',
      reason: 'الجهاز أرسل خروجاً دون دخول مفتوح خلال 15 ساعة',
    };
  }

  return {
    action: 'accept',
    eventType: requestedEventType,
    isAutomatic: 0,
  };
}
