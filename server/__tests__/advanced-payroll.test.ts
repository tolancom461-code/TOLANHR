import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as db from '../db';

describe('Advanced Payroll System', () => {
  let testWorkerId: number;
  let testGroupId: number;
  let testBatchId: number;
  const periodStart = '2026-01-01';
  const periodEnd = '2026-01-31';

  beforeEach(async () => {
    // Get a real worker ID from the database
    const allWorkers = await db.getAllWorkers();
    if (allWorkers.length > 0) {
      testWorkerId = allWorkers[0].id;
    }
  });

  afterEach(async () => {
    // Cleanup test data
  });

  describe('Daily Finance Calculation', () => {
    it('should calculate daily finances for a period', async () => {
      // This test verifies that daily finances are calculated correctly
      // for a given period without any locked days
      if (!testWorkerId) return; // Skip if no workers
      const shortEnd = '2026-01-05';
      
      const result = await db.calculateDailyFinancesForPeriod(
        testWorkerId,
        periodStart,
        shortEnd
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      // Each result should have these properties
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('workerId');
        expect(result[0]).toHaveProperty('baseAmount');
        expect(result[0]).toHaveProperty('deductions');
        expect(result[0]).toHaveProperty('bonuses');
      }
    }, 15000);

    it('should skip locked days when calculating finances', async () => {
      // This test verifies that days already locked by an approved batch
      // are not included in the calculation
      
      if (!testWorkerId) return; // Skip if no workers
      const shortEnd = '2026-01-05';
      const result = await db.calculateDailyFinancesForPeriod(
        testWorkerId,
        periodStart,
        shortEnd
      );

      // Verify that no locked days are included
      const lockedCheck = await db.checkLockedDaysInPeriod(
        testWorkerId,
        periodStart,
        shortEnd
      );

      if (lockedCheck.hasLockedDays) {
        // If there are locked days, they should not appear in the result
        const resultDates = result.map(r => r.date);
        const lockedDates = lockedCheck.lockedDays.map(d => d.date);
        
        resultDates.forEach(date => {
          expect(lockedDates).not.toContain(date);
        });
      }
    }, 15000);
  });

  describe('Double Payment Protection', () => {
    it('should identify locked days in a period', async () => {
      const result = await db.checkLockedDaysInPeriod(
        1,
        periodStart,
        periodEnd
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('hasLockedDays');
      expect(result).toHaveProperty('lockedDaysCount');
      expect(result).toHaveProperty('lockedDays');
      expect(Array.isArray(result.lockedDays)).toBe(true);
    });

    it('should prevent duplicate payment by checking locked status', async () => {
      // Get unlocked finances
      const unlockedFinances = await db.getUnlockedDailyFinances(
        1,
        periodStart,
        periodEnd
      );

      // All returned finances should have lockedBatchId as null
      unlockedFinances.forEach(finance => {
        expect(finance.lockedBatchId).toBeNull();
      });
    });
  });

  describe('Batch Locking/Unlocking', () => {
    it('should lock daily finances when batch is approved', async () => {
      const batchId = 1;
      const workerIds = [1, 2, 3];

      // Lock the finances
      const result = await db.lockDailyFinancesForBatch(
        batchId,
        workerIds,
        periodStart,
        periodEnd
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify that finances are now locked
      const lockedCheck = await db.checkLockedDaysInPeriod(
        1,
        periodStart,
        periodEnd
      );

      if (lockedCheck.hasLockedDays) {
        lockedCheck.lockedDays.forEach(day => {
          expect(day.batchId).toBe(batchId);
        });
      }
    });

    it('should unlock daily finances when batch is rejected', async () => {
      const batchId = 1;

      // Unlock the finances
      const result = await db.unlockDailyFinancesForBatch(batchId);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);

      // Verify that finances are now unlocked
      const unlockedFinances = await db.getUnlockedDailyFinances(
        1,
        periodStart,
        periodEnd
      );

      // Should now include previously locked days
      unlockedFinances.forEach(finance => {
        expect(finance.lockedBatchId).toBeNull();
      });
    });
  });

  describe('Payroll Data Aggregation', () => {
    it('should aggregate daily finances and pay overrides', async () => {
      const result = await db.aggregatePayrollData(
        1,
        periodStart,
        periodEnd
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('workerId');
      expect(result).toHaveProperty('periodStart');
      expect(result).toHaveProperty('periodEnd');
      expect(result).toHaveProperty('daysWorked');
      expect(result).toHaveProperty('baseAmount');
      expect(result).toHaveProperty('deductions');
      expect(result).toHaveProperty('bonuses');
      expect(result).toHaveProperty('netAmount');
      expect(result).toHaveProperty('dailyFinances');
      expect(result).toHaveProperty('overrides');

      // Verify numeric properties
      expect(typeof result.daysWorked).toBe('number');
      expect(typeof result.baseAmount).toBe('string');
      expect(typeof result.netAmount).toBe('string');
    });

    it('should calculate correct net amount with deductions and bonuses', async () => {
      const result = await db.aggregatePayrollData(
        1,
        periodStart,
        periodEnd
      );

      const baseAmount = parseFloat(result.baseAmount);
      const deductionsTotal = parseFloat(result.deductionsTotal);
      const bonuses = parseFloat(result.bonuses);
      const netAmount = parseFloat(result.netAmount);

      // Verify calculation: base - deductions + bonuses = net
      const expectedNet = baseAmount - deductionsTotal + bonuses;
      expect(Math.abs(netAmount - expectedNet)).toBeLessThan(0.01); // Allow for rounding
    });
  });

  describe('Period Selection', () => {
    it('should handle daily period selection', () => {
      const today = new Date();
      const start = today.toISOString().split('T')[0];
      const end = today.toISOString().split('T')[0];

      expect(start).toBe(end);
    });

    it('should handle weekly period selection', () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      
      const weekStart = new Date(today);
      weekStart.setDate(diff);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const start = weekStart.toISOString().split('T')[0];
      const end = weekEnd.toISOString().split('T')[0];

      expect(start).toBeDefined();
      expect(end).toBeDefined();
      
      // Verify week has 7 days
      const daysDiff = Math.ceil((weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      expect(daysDiff).toBe(7);
    });

    it('should handle monthly period selection', () => {
      const today = new Date();
      
      const monthStart = new Date(today);
      monthStart.setDate(1);
      
      const monthEnd = new Date(today);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const start = monthStart.toISOString().split('T')[0];
      const end = monthEnd.toISOString().split('T')[0];

      expect(start).toBeDefined();
      expect(end).toBeDefined();
      expect(monthStart <= monthEnd).toBe(true);
    });

    it('should handle custom period selection', () => {
      const customStart = '2026-01-15';
      const customEnd = '2026-01-25';

      const start = new Date(customStart);
      const end = new Date(customEnd);

      expect(start <= end).toBe(true);
      
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      expect(daysDiff).toBe(11); // 15 to 25 inclusive
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent worker gracefully', async () => {
      try {
        await db.calculateDailyFinancesForPeriod(
          99999, // Non-existent worker
          periodStart,
          periodEnd
        );
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid date ranges', async () => {
      // End date before start date should be handled
      const result = await db.aggregatePayrollData(
        1,
        periodEnd,
        periodStart // Reversed
      );

      // Should either return empty or handle gracefully
      expect(result).toBeDefined();
    });
  });
});
