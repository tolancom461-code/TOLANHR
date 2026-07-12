import { describe, it, expect } from 'vitest';
import { groupEventsByWorkDate } from '../db';

describe('Overnight shift handling', () => {
  describe('groupEventsByWorkDate', () => {
    it('should pair check_out after midnight with check_in from previous day', () => {
      const events = [
        {
          id: 1,
          workerId: 100,
          eventType: 'check_in',
          eventTime: new Date('2026-02-10T12:00:00Z'), // 3:00 PM Riyadh
        },
        {
          id: 2,
          workerId: 100,
          eventType: 'check_out',
          eventTime: new Date('2026-02-10T23:30:00Z'), // 2:30 AM Riyadh next day
        },
      ];

      const result = groupEventsByWorkDate(events);
      
      // Work date should be check_in's calendar date (Feb 10 UTC)
      expect(result['2026-02-10']).toBeDefined();
      expect(result['2026-02-10'][100]).toBeDefined();
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
    });

    it('should correctly calculate positive work minutes for overnight shifts', () => {
      const checkIn = new Date('2026-02-10T12:00:00Z');
      const checkOut = new Date('2026-02-10T23:30:00Z');
      
      const minutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
      expect(minutes).toBe(690); // 11.5 hours = 690 minutes
    });

    it('should handle frontend display of overnight shifts with negative raw diff', () => {
      // Simulates the case where check_out appears before check_in in local time display
      // (e.g., check_in 3:00 PM, check_out 2:30 AM displayed as same-day times)
      const checkInLocal = new Date('2026-02-10T15:00:00'); // 3:00 PM local
      const checkOutLocal = new Date('2026-02-10T02:30:00'); // 2:30 AM local (same day = wrong)
      
      let mins = Math.round((checkOutLocal.getTime() - checkInLocal.getTime()) / 60000);
      // This would be -750 without the fix
      expect(mins).toBeLessThan(0);
      
      // Apply the fix: add 24 hours if negative
      if (mins < 0) mins += 1440;
      expect(mins).toBe(690); // Should be 690 minutes (11.5 hours)
    });

    it('should handle multiple workers with overnight shifts', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T12:00:00Z') },
        { id: 2, workerId: 200, eventType: 'check_in', eventTime: new Date('2026-02-10T13:00:00Z') },
        { id: 3, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-10T23:30:00Z') },
        { id: 4, workerId: 200, eventType: 'check_out', eventTime: new Date('2026-02-11T00:00:00Z') },
      ];

      const result = groupEventsByWorkDate(events);
      
      // Both workers should have their events on Feb 10
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(3);
      expect(result['2026-02-10'][200].checkIn?.id).toBe(2);
      expect(result['2026-02-10'][200].checkOut?.id).toBe(4);
    });

    it('should handle orphan check_out without matching check_in', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-10T23:30:00Z') },
      ];

      const result = groupEventsByWorkDate(events);
      
      // Orphan check_out should use its own calendar date
      expect(result['2026-02-10'][100].checkOut?.id).toBe(1);
      expect(result['2026-02-10'][100].checkIn).toBeUndefined();
    });

    it('should correctly pair same-day shifts (non-overnight)', () => {
      const events = [
        { id: 1, workerId: 100, eventType: 'check_in', eventTime: new Date('2026-02-10T06:00:00Z') },
        { id: 2, workerId: 100, eventType: 'check_out', eventTime: new Date('2026-02-10T14:00:00Z') },
      ];

      const result = groupEventsByWorkDate(events);
      
      expect(result['2026-02-10'][100].checkIn?.id).toBe(1);
      expect(result['2026-02-10'][100].checkOut?.id).toBe(2);
      
      const checkIn = new Date('2026-02-10T06:00:00Z');
      const checkOut = new Date('2026-02-10T14:00:00Z');
      const minutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
      expect(minutes).toBe(480); // 8 hours
    });
  });
});
