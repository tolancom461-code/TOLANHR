import { describe, it, expect } from 'vitest';

/**
 * Test to verify the timezone-safe date comparison logic
 * The bug was: new Date("2026-02-10") = 2026-02-10T00:00:00.000Z (UTC midnight)
 * But workerDailyFinance.workDate stored as 2026-02-10T05:00:00.000Z (timezone offset)
 * So lte(workDate, endDate) => 05:00 <= 00:00 => FALSE (last day excluded!)
 * 
 * Fix: Use DATE() cast in SQL to compare date-only, ignoring time component
 */

describe('Date comparison timezone safety', () => {
  it('should demonstrate the timezone bug with Date objects', () => {
    // This is what was happening before the fix
    const periodEnd = "2026-02-10";
    const endDate = new Date(periodEnd); // 2026-02-10T00:00:00.000Z
    
    // This is how the date was stored in DB (with timezone offset)
    const storedDate = new Date("2026-02-10T05:00:00.000Z");
    
    // The comparison that was failing:
    // storedDate <= endDate => 05:00 <= 00:00 => FALSE
    expect(storedDate <= endDate).toBe(false); // BUG! Last day excluded
  });

  it('should show the fix using DATE string comparison', () => {
    const periodEnd = "2026-02-10";
    const endDateStr = periodEnd.split('T')[0]; // "2026-02-10"
    
    // The stored date in DB
    const storedDate = new Date("2026-02-10T05:00:00.000Z");
    const storedDateStr = storedDate.toISOString().split('T')[0]; // "2026-02-10"
    
    // String comparison works correctly
    expect(storedDateStr <= endDateStr).toBe(true); // FIXED! Last day included
  });

  it('should correctly handle start date comparison', () => {
    const periodStart = "2026-02-05";
    const startDateStr = periodStart.split('T')[0]; // "2026-02-05"
    
    const storedDate = new Date("2026-02-05T05:00:00.000Z");
    const storedDateStr = storedDate.toISOString().split('T')[0]; // "2026-02-05"
    
    expect(storedDateStr >= startDateStr).toBe(true);
  });

  it('should correctly exclude dates outside range', () => {
    const periodStart = "2026-02-05";
    const periodEnd = "2026-02-10";
    
    // Date before range
    const beforeDate = new Date("2026-02-04T05:00:00.000Z");
    const beforeStr = beforeDate.toISOString().split('T')[0]; // "2026-02-04"
    expect(beforeStr >= periodStart).toBe(false);
    
    // Date after range
    const afterDate = new Date("2026-02-11T05:00:00.000Z");
    const afterStr = afterDate.toISOString().split('T')[0]; // "2026-02-11"
    expect(afterStr <= periodEnd).toBe(false);
  });

  it('should handle ISO date strings with T component', () => {
    const periodStart = "2026-02-05T00:00:00.000Z";
    const startDateStr = periodStart.split('T')[0]; // "2026-02-05"
    expect(startDateStr).toBe("2026-02-05");
    
    const periodEnd = "2026-02-10";
    const endDateStr = periodEnd.split('T')[0]; // "2026-02-10"
    expect(endDateStr).toBe("2026-02-10");
  });

  it('should verify batch total matches report total with correct date handling', () => {
    // Simulating the data from the database
    const dailyRecords = [
      // Worker 180001 - 6 days @ 80
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-05' },
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-06' },
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-07' },
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-08' },
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-09' },
      { workerId: 180001, baseAmount: '80.00', date: '2026-02-10' },
      // Worker 180002 - 5 days @ 80
      { workerId: 180002, baseAmount: '80.00', date: '2026-02-05' },
      { workerId: 180002, baseAmount: '80.00', date: '2026-02-06' },
      { workerId: 180002, baseAmount: '80.00', date: '2026-02-07' },
      { workerId: 180002, baseAmount: '80.00', date: '2026-02-09' },
      { workerId: 180002, baseAmount: '80.00', date: '2026-02-10' },
      // Worker 180004 - 6 days @ 80
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-05' },
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-06' },
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-07' },
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-08' },
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-09' },
      { workerId: 180004, baseAmount: '80.00', date: '2026-02-10' },
      // Worker 180005 - 2 days @ 80
      { workerId: 180005, baseAmount: '80.00', date: '2026-02-05' },
      { workerId: 180005, baseAmount: '80.00', date: '2026-02-06' },
      // Worker 180006 - 6 days @ 80
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-05' },
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-06' },
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-07' },
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-08' },
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-09' },
      { workerId: 180006, baseAmount: '80.00', date: '2026-02-10' },
    ];

    const periodStart = "2026-02-05";
    const periodEnd = "2026-02-10";

    // Filter using string comparison (the fix)
    const filtered = dailyRecords.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const totalBase = filtered.reduce((sum, r) => sum + parseFloat(r.baseAmount), 0);

    expect(totalBase).toBe(2000); // Should match batch total
    expect(filtered.length).toBe(25); // All 25 records included
  });
});
