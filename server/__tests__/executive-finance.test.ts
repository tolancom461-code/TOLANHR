import { describe, it, expect } from 'vitest';
import * as db from '../db';

describe('getExecutiveFinanceSummary', () => {
  it('should return finance summary for a valid date range', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    expect(result).toBeDefined();
    expect(result).toHaveProperty('periodStart', '2026-02-01');
    expect(result).toHaveProperty('periodEnd', '2026-02-10');
    expect(result).toHaveProperty('totalNet');
    expect(result).toHaveProperty('totalBase');
    expect(result).toHaveProperty('totalDeductions');
    expect(result).toHaveProperty('totalBonuses');
    expect(result).toHaveProperty('byCostCenter');
    expect(result).toHaveProperty('byGroup');
    expect(Array.isArray(result.byCostCenter)).toBe(true);
    expect(Array.isArray(result.byGroup)).toBe(true);
  });

  it('should return numeric string values for totals', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    // totalNet should be a string that can be parsed as a number
    const totalNet = parseFloat(result.totalNet);
    expect(isNaN(totalNet)).toBe(false);
    expect(totalNet).toBeGreaterThanOrEqual(0);
    
    const totalBase = parseFloat(result.totalBase);
    expect(isNaN(totalBase)).toBe(false);
    expect(totalBase).toBeGreaterThanOrEqual(0);
  });

  it('should return cost center breakdown with correct structure', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (result.byCostCenter.length > 0) {
      const cc = result.byCostCenter[0];
      expect(cc).toHaveProperty('id');
      expect(cc).toHaveProperty('name');
      expect(cc).toHaveProperty('code');
      expect(cc).toHaveProperty('total');
      expect(typeof cc.id).toBe('number');
      expect(typeof cc.name).toBe('string');
      expect(typeof cc.total).toBe('string');
    }
  });

  it('should return group breakdown with correct structure', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (result.byGroup.length > 0) {
      const g = result.byGroup[0];
      expect(g).toHaveProperty('id');
      expect(g).toHaveProperty('name');
      expect(g).toHaveProperty('code');
      expect(g).toHaveProperty('total');
      expect(typeof g.id).toBe('number');
      expect(typeof g.name).toBe('string');
      expect(typeof g.total).toBe('string');
    }
  });

  it('should return zero totals for a date range with no data', async () => {
    const result = await db.getExecutiveFinanceSummary('2020-01-01', '2020-01-31');
    
    expect(parseFloat(result.totalNet)).toBe(0);
    expect(parseFloat(result.totalBase)).toBe(0);
    expect(parseFloat(result.totalDeductions)).toBe(0);
    expect(parseFloat(result.totalBonuses)).toBe(0);
    expect(result.byCostCenter).toHaveLength(0);
    expect(result.byGroup).toHaveLength(0);
  });

  it('should filter by groupId when provided', async () => {
    // First get all data
    const allResult = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (allResult.byGroup.length > 0) {
      const firstGroupId = allResult.byGroup[0].id;
      const filteredResult = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10', firstGroupId);
      
      // Filtered result should have equal or less total
      expect(parseFloat(filteredResult.totalNet)).toBeLessThanOrEqual(parseFloat(allResult.totalNet));
      
      // Should only have one group or no groups in breakdown (since we filtered)
      // The byGroup may still show the filtered group
    }
  });

  it('should filter by costCenterId when provided', async () => {
    // First get all data
    const allResult = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (allResult.byCostCenter.length > 0) {
      const firstCCId = allResult.byCostCenter[0].id;
      const filteredResult = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10', undefined, firstCCId);
      
      // Filtered result should have equal or less total
      expect(parseFloat(filteredResult.totalNet)).toBeLessThanOrEqual(parseFloat(allResult.totalNet));
    }
  });

  it('should have totalNet >= sum of cost center totals (when no filters)', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (result.byCostCenter.length > 0) {
      const sumByCostCenter = result.byCostCenter.reduce((sum, cc) => sum + parseFloat(cc.total), 0);
      // totalNet may include workers without cost centers, so it can be >= sum
      expect(parseFloat(result.totalNet)).toBeGreaterThanOrEqual(sumByCostCenter - 0.01);
    }
  });

  it('should have totalNet equal to sum of group totals (when no filters)', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    if (result.byGroup.length > 0) {
      const sumByGroup = result.byGroup.reduce((sum, g) => sum + parseFloat(g.total), 0);
      // Allow small floating point differences
      expect(Math.abs(parseFloat(result.totalNet) - sumByGroup)).toBeLessThan(0.01);
    }
  });

  it('should return data with existing finance records', async () => {
    const result = await db.getExecutiveFinanceSummary('2026-02-01', '2026-02-10');
    
    // We know there should be data for this period based on the test data
    const totalNet = parseFloat(result.totalNet);
    expect(totalNet).toBeGreaterThan(0);
    expect(result.byCostCenter.length).toBeGreaterThan(0);
    expect(result.byGroup.length).toBeGreaterThan(0);
  });
});
