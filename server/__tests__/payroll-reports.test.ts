import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';

describe('Payroll Reports System', () => {
  describe('getPayrollReportByGroup', () => {
    it('should return report data grouped by work groups', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const result = await db.getPayrollReportByGroup(periodStart, periodEnd);
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
      
      // Each item should have required fields
      if (result.length > 0) {
        const firstItem = result[0];
        expect(firstItem).toHaveProperty('groupId');
        expect(firstItem).toHaveProperty('groupName');
        expect(firstItem).toHaveProperty('groupCode');
        expect(firstItem).toHaveProperty('workerCount');
        expect(firstItem).toHaveProperty('totalSalary');
        expect(firstItem).toHaveProperty('totalDeductions');
        expect(firstItem).toHaveProperty('totalBonuses');
        expect(firstItem).toHaveProperty('totalNet');
        
        // Numeric fields should be formatted strings
        expect(typeof firstItem.totalSalary).toBe('string');
        expect(typeof firstItem.totalDeductions).toBe('string');
        expect(typeof firstItem.totalBonuses).toBe('string');
        expect(typeof firstItem.totalNet).toBe('string');
      }
    });

    it('should filter by specific group ID when provided', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      const groupId = 1;
      
      const result = await db.getPayrollReportByGroup(periodStart, periodEnd, groupId);
      
      // Should return only data for the specified group
      if (result.length > 0) {
        result.forEach(item => {
          expect(item.groupId).toBe(groupId);
        });
      }
    });
  });

  describe('getPayrollReportByWorker', () => {
    it('should return report data grouped by workers', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const result = await db.getPayrollReportByWorker(periodStart, periodEnd);
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
      
      // Each item should have required fields
      if (result.length > 0) {
        const firstItem = result[0];
        expect(firstItem).toHaveProperty('workerId');
        expect(firstItem).toHaveProperty('workerName');
        expect(firstItem).toHaveProperty('workerCode');
        expect(firstItem).toHaveProperty('groupName');
        expect(firstItem).toHaveProperty('groupCode');
        expect(firstItem).toHaveProperty('totalSalary');
        expect(firstItem).toHaveProperty('totalDeductions');
        expect(firstItem).toHaveProperty('totalBonuses');
        expect(firstItem).toHaveProperty('totalNet');
      }
    });

    it('should filter by specific worker ID when provided', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      const workerId = 1;
      
      const result = await db.getPayrollReportByWorker(periodStart, periodEnd, workerId);
      
      // Should return only data for the specified worker
      if (result.length > 0) {
        result.forEach(item => {
          expect(item.workerId).toBe(workerId);
        });
      }
    });
  });

  describe('getPayrollReportSummary', () => {
    it('should return summary report for all groups', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const result = await db.getPayrollReportSummary(periodStart, periodEnd);
      
      // Should return an array
      expect(Array.isArray(result)).toBe(true);
      
      // Should have same structure as group report
      if (result.length > 0) {
        const firstItem = result[0];
        expect(firstItem).toHaveProperty('groupId');
        expect(firstItem).toHaveProperty('groupName');
        expect(firstItem).toHaveProperty('totalSalary');
        expect(firstItem).toHaveProperty('totalNet');
      }
    });
  });

  describe('Report Data Integrity', () => {
    it('should have consistent totals (salary - deductions + bonuses = net)', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const result = await db.getPayrollReportByGroup(periodStart, periodEnd);
      
      result.forEach(item => {
        const salary = parseFloat(item.totalSalary);
        const deductions = parseFloat(item.totalDeductions);
        const bonuses = parseFloat(item.totalBonuses);
        const net = parseFloat(item.totalNet);
        
        const calculatedNet = salary - deductions + bonuses;
        
        // Allow small floating point differences (0.01)
        expect(Math.abs(calculatedNet - net)).toBeLessThan(0.01);
      });
    });

    it('should format all monetary values to 2 decimal places', async () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const result = await db.getPayrollReportByGroup(periodStart, periodEnd);
      
      result.forEach(item => {
        // Check that all monetary fields have exactly 2 decimal places (allow negative values)
        expect(item.totalSalary).toMatch(/^-?\d+\.\d{2}$/);
        expect(item.totalDeductions).toMatch(/^-?\d+\.\d{2}$/);
        expect(item.totalBonuses).toMatch(/^-?\d+\.\d{2}$/);
        expect(item.totalNet).toMatch(/^-?\d+\.\d{2}$/);
      });
    });
  });
});
