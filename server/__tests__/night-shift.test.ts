import { describe, it, expect } from 'vitest';

/**
 * Night Shift Logic Tests
 * Tests the core utility functions that handle night shift attendance grouping
 */

// Import the utility functions directly
// We test the pure logic functions that don't need database access
import { groupEventsByWorkDate, getExpandedDateRange } from '../db';

describe('Night Shift Utilities', () => {
  
  // Note: getWorkDateForCheckOut is async and requires DB access,
  // so it's tested indirectly through groupEventsByWorkDate which is pure logic

  describe('getExpandedDateRange', () => {
    it('should extend search range to cover night shifts', () => {
      const result = getExpandedDateRange('2026-02-10');
      // startOfDay should go back 24 hours to capture previous day check_ins
      expect(result.startOfDay.toISOString()).toBe('2026-02-09T00:00:00.000Z');
      // endOfSearch should extend to next day 10 AM UTC to catch night shift check_outs
      expect(result.endOfSearch.toISOString()).toBe('2026-02-11T10:00:00.000Z');
    });

    it('should use UTC explicitly to avoid timezone issues', () => {
      const result = getExpandedDateRange('2026-02-10');
      // startOfDay is previous day midnight UTC
      expect(result.startOfDay.getUTCHours()).toBe(0);
      expect(result.startOfDay.getUTCMinutes()).toBe(0);
    });
  });

  describe('groupEventsByWorkDate', () => {
    it('should group daytime events correctly', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T08:00:00') },
        { id: 2, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-10T17:00:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      expect(result['2026-02-10']).toBeDefined();
      expect(result['2026-02-10'][100]).toBeDefined();
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
    });

    it('should group night shift events under check_in date', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T18:00:00') },
        { id: 2, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-11T03:00:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      // Both events should be grouped under Feb 10 (check_in date)
      expect(result['2026-02-10']).toBeDefined();
      expect(result['2026-02-10'][100]).toBeDefined();
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
      
      // Feb 11 should NOT have this worker's data
      expect(result['2026-02-11']?.[100]).toBeUndefined();
    });

    it('should handle multiple workers on same night shift', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T18:00:00') },
        { id: 2, workerId: 200, eventType: 'check_in', eventTime: new Date('2026-02-10T18:30:00') },
        { id: 3, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-11T03:00:00') },
        { id: 4, workerId: 200, eventType: 'check_out', eventTime: new Date('2026-02-11T02:30:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      // Both workers should be under Feb 10
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(3);
      expect(result['2026-02-10'][200].checkIn?.id).toBe(2);
      expect(result['2026-02-10'][200].checkOut?.id).toBe(4);
    });

    it('should handle night shift and morning shift on consecutive days', () => {
      const events = [
        // Night shift worker: check_in 6 PM Feb 10, check_out 3 AM Feb 11
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T18:00:00') },
        { id: 2, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-11T03:00:00') },
        // Morning shift worker: check_in 5 AM Feb 11, check_out 2 PM Feb 11
        { id: 3, workerId: 200, eventType: 'check_in', eventTime: new Date('2026-02-11T05:00:00') },
        { id: 4, workerId: 200, eventType: 'check_out', eventTime: new Date('2026-02-11T14:00:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      // Night shift worker under Feb 10
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
      
      // Morning shift worker under Feb 11
      expect(result['2026-02-11'][200].checkIn?.id).toBe(3);
      expect(result['2026-02-11'][200].checkOut?.id).toBe(4);
    });

    it('should handle worker with check_in only (no check_out yet)', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T18:00:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut).toBeUndefined();
    });

    it('should handle same worker working night shift then morning shift next day', () => {
      const events = [
        // Same worker: night shift Feb 10
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T18:00:00') },
        { id: 2, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-11T03:00:00') },
        // Same worker: morning shift Feb 11
        { id: 3, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-11T08:00:00') },
        { id: 4, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-11T17:00:00') },
      ];
      
      const result = groupEventsByWorkDate(events);
      
      // Night shift under Feb 10
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
      
      // Morning shift under Feb 11
      expect(result['2026-02-11'][100].checkIn?.id).toBe(3);
      expect(result['2026-02-11'][100].checkOut?.id).toBe(4);
    });
  });
});
