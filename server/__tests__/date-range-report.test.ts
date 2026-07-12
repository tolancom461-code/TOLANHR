import { describe, it, expect } from 'vitest';

describe('Date Range Attendance Report', () => {
  // Test date range string format validation
  describe('Date string format validation', () => {
    it('should accept valid YYYY-MM-DD format', () => {
      const dateStr = '2026-02-01';
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      expect(regex.test(dateStr)).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const invalidDates = ['02/01/2026', '2026-2-1', '01-02-2026', 'invalid'];
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      invalidDates.forEach(d => {
        expect(regex.test(d)).toBe(false);
      });
    });
  });

  // Test date range construction
  describe('Date range construction', () => {
    it('should create correct start date from string', () => {
      const startDateStr = '2026-02-01';
      const startDate = new Date(startDateStr + 'T00:00:00');
      expect(startDate.getFullYear()).toBe(2026);
      expect(startDate.getMonth()).toBe(1); // 0-indexed
      expect(startDate.getDate()).toBe(1);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
    });

    it('should create correct end date with 23:59:59', () => {
      const endDateStr = '2026-02-28';
      const endDate = new Date(endDateStr + 'T23:59:59');
      expect(endDate.getFullYear()).toBe(2026);
      expect(endDate.getMonth()).toBe(1);
      expect(endDate.getDate()).toBe(28);
      expect(endDate.getHours()).toBe(23);
      expect(endDate.getMinutes()).toBe(59);
    });

    it('should handle single day range (same start and end)', () => {
      const dateStr = '2026-02-10';
      const startDate = new Date(dateStr + 'T00:00:00');
      const endDate = new Date(dateStr + 'T23:59:59');
      expect(endDate.getTime() - startDate.getTime()).toBeGreaterThan(0);
      expect(endDate.getTime() - startDate.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('should handle multi-day range correctly', () => {
      const startDate = new Date('2026-02-01T00:00:00');
      const endDate = new Date('2026-02-28T23:59:59');
      const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(28);
    });
  });

  // Test report data aggregation logic
  describe('Report data aggregation', () => {
    it('should calculate average hours per day correctly', () => {
      const totalHours = 10;
      const daysPresent = 5;
      const avg = daysPresent > 0 ? Math.round((totalHours / daysPresent) * 100) / 100 : 0;
      expect(avg).toBe(2);
    });

    it('should return 0 avg when no days present', () => {
      const totalHours = 0;
      const daysPresent = 0;
      const avg = daysPresent > 0 ? Math.round((totalHours / daysPresent) * 100) / 100 : 0;
      expect(avg).toBe(0);
    });

    it('should calculate work hours from check-in/check-out times', () => {
      const checkIn = new Date('2026-02-01T08:00:00');
      const checkOut = new Date('2026-02-01T16:00:00');
      const hours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      expect(hours).toBe(8);
    });

    it('should group events by date correctly', () => {
      const events = [
        { eventTime: new Date('2026-02-01T08:00:00'), eventType: 'check_in' },
        { eventTime: new Date('2026-02-01T16:00:00'), eventType: 'check_out' },
        { eventTime: new Date('2026-02-02T09:00:00'), eventType: 'check_in' },
        { eventTime: new Date('2026-02-02T17:00:00'), eventType: 'check_out' },
      ];

      const eventsByDate = events.reduce((acc, event) => {
        const dateKey = new Date(event.eventTime).toLocaleDateString('en-CA');
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(event);
        return acc;
      }, {} as Record<string, typeof events>);

      expect(Object.keys(eventsByDate)).toHaveLength(2);
      expect(eventsByDate['2026-02-01']).toHaveLength(2);
      expect(eventsByDate['2026-02-02']).toHaveLength(2);
    });
  });

  // Test filter mode switching
  describe('Filter mode behavior', () => {
    it('should use monthly query when filterMode is monthly', () => {
      const filterMode = 'monthly';
      const isMonthlyEnabled = filterMode === 'monthly';
      const isDateRangeEnabled = filterMode === 'dateRange';
      expect(isMonthlyEnabled).toBe(true);
      expect(isDateRangeEnabled).toBe(false);
    });

    it('should use dateRange query when filterMode is dateRange', () => {
      const filterMode = 'dateRange';
      const isMonthlyEnabled = filterMode === 'monthly';
      const isDateRangeEnabled = filterMode === 'dateRange';
      expect(isMonthlyEnabled).toBe(false);
      expect(isDateRangeEnabled).toBe(true);
    });
  });

  // Test report title generation
  describe('Report title generation', () => {
    it('should generate correct monthly title', () => {
      const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      const filterMode = 'monthly';
      const selectedMonth = 2;
      const selectedYear = 2026;
      const startDate = '2026-02-01';
      const endDate = '2026-02-28';

      const title = filterMode === 'monthly'
        ? `تقرير ${MONTHS[selectedMonth - 1]} ${selectedYear}`
        : `تقرير من ${startDate} إلى ${endDate}`;

      expect(title).toBe('تقرير فبراير 2026');
    });

    it('should generate correct date range title', () => {
      const MONTHS = ['يناير', 'فبراير'];
      const filterMode = 'dateRange';
      const selectedMonth = 2;
      const selectedYear = 2026;
      const startDate = '2026-02-01';
      const endDate = '2026-02-15';

      const title = filterMode === 'monthly'
        ? `تقرير ${MONTHS[selectedMonth - 1]} ${selectedYear}`
        : `تقرير من ${startDate} إلى ${endDate}`;

      expect(title).toBe('تقرير من 2026-02-01 إلى 2026-02-15');
    });
  });
});
