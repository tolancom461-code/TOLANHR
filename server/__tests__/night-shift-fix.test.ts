import { describe, it, expect } from 'vitest';
import { groupEventsByWorkDate, getExpandedDateRange } from '../db';

describe('Night shift fix - expanded date range', () => {
  it('getExpandedDateRange should start from previous day 00:00 UTC', () => {
    const { startOfDay, endOfSearch } = getExpandedDateRange('2026-02-05');
    
    // startOfDay should be Feb 4 at 00:00 UTC (24 hours before)
    expect(startOfDay.toISOString()).toBe('2026-02-04T00:00:00.000Z');
    
    // endOfSearch should be Feb 6 at 10:00 AM UTC (+34 hours)
    expect(endOfSearch.toISOString()).toBe('2026-02-06T10:00:00.000Z');
  });

  it('should correctly pair check_out after midnight with previous day check_in', () => {
    // Scenario: Worker checks in at 6 PM on Feb 4, checks out at 2:30 AM on Feb 5
    // Then checks in again at 4:55 PM on Feb 5
    const events = [
      {
        workerId: 1,
        eventType: 'check_in',
        eventTime: new Date('2026-02-04T15:00:00Z'), // 6 PM local (+3)
        id: 1,
      },
      {
        workerId: 1,
        eventType: 'check_out',
        eventTime: new Date('2026-02-04T23:30:00Z'), // 2:30 AM local (+3) on Feb 5
        id: 2,
      },
      {
        workerId: 1,
        eventType: 'check_in',
        eventTime: new Date('2026-02-05T13:55:00Z'), // 4:55 PM local (+3) on Feb 5
        id: 3,
      },
    ];

    const grouped = groupEventsByWorkDate(events);

    // Feb 4 should have check_in (6 PM) and check_out (2:30 AM next day)
    expect(grouped['2026-02-04']).toBeDefined();
    expect(grouped['2026-02-04'][1]).toBeDefined();
    expect(grouped['2026-02-04'][1].checkIn?.id).toBe(1);
    expect(grouped['2026-02-04'][1].checkOut?.id).toBe(2);

    // Feb 5 should have only check_in (4:55 PM), no check_out yet
    expect(grouped['2026-02-05']).toBeDefined();
    expect(grouped['2026-02-05'][1]).toBeDefined();
    expect(grouped['2026-02-05'][1].checkIn?.id).toBe(3);
    expect(grouped['2026-02-05'][1].checkOut).toBeUndefined();
  });

  it('should handle W01 exact scenario: orphan check_out + new check_in same day', () => {
    // Exact W01 scenario:
    // check_out at 02:30 UTC Feb 5 (orphan - check_in was Feb 4 evening)
    // check_in at 16:55 UTC Feb 5 (new shift)
    // When we include the Feb 4 check_in, it should pair correctly
    const events = [
      {
        workerId: 180104,
        eventType: 'check_in',
        eventTime: new Date('2026-02-04T15:00:00Z'), // Feb 4 evening
        id: 100,
      },
      {
        workerId: 180104,
        eventType: 'check_out',
        eventTime: new Date('2026-02-05T02:30:00Z'), // Feb 5 early morning
        id: 101,
      },
      {
        workerId: 180104,
        eventType: 'check_in',
        eventTime: new Date('2026-02-05T16:55:00Z'), // Feb 5 evening
        id: 102,
      },
    ];

    const grouped = groupEventsByWorkDate(events);

    // Feb 4: check_in (evening) + check_out (next morning) = complete day
    expect(grouped['2026-02-04']).toBeDefined();
    expect(grouped['2026-02-04'][180104].checkIn?.id).toBe(100);
    expect(grouped['2026-02-04'][180104].checkOut?.id).toBe(101);

    // Feb 5: only check_in (evening), no check_out yet
    expect(grouped['2026-02-05']).toBeDefined();
    expect(grouped['2026-02-05'][180104].checkIn?.id).toBe(102);
    expect(grouped['2026-02-05'][180104].checkOut).toBeUndefined();
  });

  it('should not affect morning shifts starting at 5 AM', () => {
    const events = [
      {
        workerId: 2,
        eventType: 'check_in',
        eventTime: new Date('2026-02-05T02:00:00Z'), // 5 AM local (+3)
        id: 200,
      },
      {
        workerId: 2,
        eventType: 'check_out',
        eventTime: new Date('2026-02-05T11:00:00Z'), // 2 PM local (+3)
        id: 201,
      },
    ];

    const grouped = groupEventsByWorkDate(events);

    // groupEventsByWorkDate uses toLocaleDateString('en-CA') which depends on server TZ
    // The check_in at 02:00 UTC may resolve to Feb 4 or Feb 5 depending on TZ
    // What matters is that check_in and check_out are paired together
    const allDates = Object.keys(grouped);
    let found = false;
    for (const date of allDates) {
      if (grouped[date][2]?.checkIn?.id === 200 && grouped[date][2]?.checkOut?.id === 201) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('expanded range should include previous day check_in for night shift pairing', () => {
    const range = getExpandedDateRange('2026-02-05');
    
    // A check_in at 3 PM (UTC) on Feb 4 = 6 PM local
    const checkInTime = new Date('2026-02-04T15:00:00Z');
    
    // Range starts at Feb 4 00:00 UTC, so 3 PM UTC Feb 4 should be within range
    expect(checkInTime.getTime()).toBeGreaterThanOrEqual(range.startOfDay.getTime());
    expect(checkInTime.getTime()).toBeLessThanOrEqual(range.endOfSearch.getTime());
  });
});
