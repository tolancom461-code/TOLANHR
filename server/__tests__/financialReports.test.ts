import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';

describe('Financial Reports', () => {
  let testWorkerId: number;
  let testGroupId: number;
  let testCostCenterId: number;
  const startDate = new Date('2026-01-08');
  const endDate = new Date('2026-01-14');

  beforeAll(async () => {
    // Get test data IDs
    const workers = await db.getAllWorkers();
    const groups = await db.getAllGroups();
    const costCenters = await db.getAllCostCenters();

    if (workers.length === 0 || groups.length === 0 || costCenters.length === 0) {
      throw new Error('No test data available. Run seed-demo-data.mjs first.');
    }

    testWorkerId = workers[0].id;
    testGroupId = groups[0].id;
    testCostCenterId = costCenters[0].id;
  });

  describe('Worker Financial Report', () => {
    it('should return financial report for a worker', async () => {
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      expect(report).toBeDefined();
      expect(report.worker).toBeDefined();
      expect(report.worker.id).toBe(testWorkerId);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalDaysWorked).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalBaseAmount).toBeDefined();
      expect(report.summary.totalDeductions).toBeDefined();
      expect(report.summary.totalBonuses).toBeDefined();
      expect(report.summary.totalNetAmount).toBeDefined();
    });

    it('should calculate net amount correctly', async () => {
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      const baseAmount = parseFloat(report.summary.totalBaseAmount);
      const deductions = parseFloat(report.summary.totalDeductions);
      const bonuses = parseFloat(report.summary.totalBonuses);
      const netAmount = parseFloat(report.summary.totalNetAmount);

      // Net = Base - Deductions + Bonuses
      const expectedNet = baseAmount - deductions + bonuses;
      expect(netAmount).toBeCloseTo(expectedNet, 2);
    });

    it('should include daily records', async () => {
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      expect(report.dailyRecords).toBeDefined();
      expect(Array.isArray(report.dailyRecords)).toBe(true);
      
      if (report.dailyRecords.length > 0) {
        const record = report.dailyRecords[0];
        expect(record.workerId).toBe(testWorkerId);
        expect(record.workDate).toBeDefined();
        expect(record.baseAmount).toBeDefined();
        expect(record.deductions).toBeDefined();
        expect(record.bonuses).toBeDefined();
        expect(record.netAmount).toBeDefined();
      }
    });

    it('should include approved pay overrides', async () => {
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      expect(report.overrides).toBeDefined();
      expect(Array.isArray(report.overrides)).toBe(true);
      
      // All overrides should be approved
      report.overrides.forEach(override => {
        expect(override.status).toBe('approved');
        expect(override.workerId).toBe(testWorkerId);
      });
    });
  });

  describe('Group Financial Report', () => {
    it('should return financial report for a group', async () => {
      const report = await db.getGroupFinancialReport(testGroupId, startDate, endDate);

      expect(report).toBeDefined();
      expect(report.group).toBeDefined();
      expect(report.group.id).toBe(testGroupId);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalWorkers).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalDaysWorked).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalBaseAmount).toBeDefined();
      expect(report.summary.totalDeductions).toBeDefined();
      expect(report.summary.totalBonuses).toBeDefined();
      expect(report.summary.totalNetAmount).toBeDefined();
    });

    it('should aggregate worker reports correctly', async () => {
      const report = await db.getGroupFinancialReport(testGroupId, startDate, endDate);

      expect(report.workerReports).toBeDefined();
      expect(Array.isArray(report.workerReports)).toBe(true);
      expect(report.workerReports.length).toBe(report.summary.totalWorkers);

      // Sum of worker reports should match group summary
      let sumBaseAmount = 0;
      let sumDeductions = 0;
      let sumBonuses = 0;
      let sumNetAmount = 0;

      report.workerReports.forEach(worker => {
        sumBaseAmount += parseFloat(worker.totalBaseAmount);
        sumDeductions += parseFloat(worker.totalDeductions);
        sumBonuses += parseFloat(worker.totalBonuses);
        sumNetAmount += parseFloat(worker.totalNetAmount);
      });

      expect(parseFloat(report.summary.totalBaseAmount)).toBeCloseTo(sumBaseAmount, 2);
      expect(parseFloat(report.summary.totalDeductions)).toBeCloseTo(sumDeductions, 2);
      expect(parseFloat(report.summary.totalBonuses)).toBeCloseTo(sumBonuses, 2);
      expect(parseFloat(report.summary.totalNetAmount)).toBeCloseTo(sumNetAmount, 2);
    });

    it('should include worker details in reports', async () => {
      const report = await db.getGroupFinancialReport(testGroupId, startDate, endDate);

      if (report.workerReports.length > 0) {
        const workerReport = report.workerReports[0];
        expect(workerReport.workerId).toBeDefined();
        expect(workerReport.workerCode).toBeDefined();
        expect(workerReport.workerName).toBeDefined();
        expect(workerReport.totalDaysWorked).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Cost Center Financial Report', () => {
    it('should return financial report for a cost center', async () => {
      const report = await db.getCostCenterFinancialReport(testCostCenterId, startDate, endDate);

      expect(report).toBeDefined();
      expect(report.costCenter).toBeDefined();
      expect(report.costCenter.id).toBe(testCostCenterId);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalGroups).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalWorkers).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalDaysWorked).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalBaseAmount).toBeDefined();
      expect(report.summary.totalDeductions).toBeDefined();
      expect(report.summary.totalBonuses).toBeDefined();
      expect(report.summary.totalNetAmount).toBeDefined();
    });

    it('should aggregate group reports correctly', async () => {
      const report = await db.getCostCenterFinancialReport(testCostCenterId, startDate, endDate);

      expect(report.groupReports).toBeDefined();
      expect(Array.isArray(report.groupReports)).toBe(true);
      expect(report.groupReports.length).toBe(report.summary.totalGroups);

      // Sum of group reports should match cost center summary
      let sumWorkers = 0;
      let sumBaseAmount = 0;
      let sumDeductions = 0;
      let sumBonuses = 0;
      let sumNetAmount = 0;

      report.groupReports.forEach(group => {
        sumWorkers += group.totalWorkers;
        sumBaseAmount += parseFloat(group.totalBaseAmount);
        sumDeductions += parseFloat(group.totalDeductions);
        sumBonuses += parseFloat(group.totalBonuses);
        sumNetAmount += parseFloat(group.totalNetAmount);
      });

      expect(report.summary.totalWorkers).toBe(sumWorkers);
      expect(parseFloat(report.summary.totalBaseAmount)).toBeCloseTo(sumBaseAmount, 2);
      expect(parseFloat(report.summary.totalDeductions)).toBeCloseTo(sumDeductions, 2);
      expect(parseFloat(report.summary.totalBonuses)).toBeCloseTo(sumBonuses, 2);
      expect(parseFloat(report.summary.totalNetAmount)).toBeCloseTo(sumNetAmount, 2);
    });

    it('should include group details in reports', async () => {
      const report = await db.getCostCenterFinancialReport(testCostCenterId, startDate, endDate);

      if (report.groupReports.length > 0) {
        const groupReport = report.groupReports[0];
        expect(groupReport.groupId).toBeDefined();
        expect(groupReport.groupCode).toBeDefined();
        expect(groupReport.groupName).toBeDefined();
        expect(groupReport.totalWorkers).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('All Financial Reports Summary', () => {
    it('should return summary for all cost centers', async () => {
      const report = await db.getAllFinancialReportsSummary(startDate, endDate);

      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.summary.totalCostCenters).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalGroups).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalWorkers).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalDaysWorked).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalBaseAmount).toBeDefined();
      expect(report.summary.totalDeductions).toBeDefined();
      expect(report.summary.totalBonuses).toBeDefined();
      expect(report.summary.totalNetAmount).toBeDefined();
    });

    it('should aggregate cost center reports correctly', async () => {
      const report = await db.getAllFinancialReportsSummary(startDate, endDate);

      expect(report.costCenterReports).toBeDefined();
      expect(Array.isArray(report.costCenterReports)).toBe(true);
      expect(report.costCenterReports.length).toBe(report.summary.totalCostCenters);

      // Sum of cost center reports should match overall summary
      let sumGroups = 0;
      let sumWorkers = 0;
      let sumBaseAmount = 0;
      let sumDeductions = 0;
      let sumBonuses = 0;
      let sumNetAmount = 0;

      report.costCenterReports.forEach(cc => {
        sumGroups += cc.totalGroups;
        sumWorkers += cc.totalWorkers;
        sumBaseAmount += parseFloat(cc.totalBaseAmount);
        sumDeductions += parseFloat(cc.totalDeductions);
        sumBonuses += parseFloat(cc.totalBonuses);
        sumNetAmount += parseFloat(cc.totalNetAmount);
      });

      expect(report.summary.totalGroups).toBe(sumGroups);
      expect(report.summary.totalWorkers).toBe(sumWorkers);
      expect(parseFloat(report.summary.totalBaseAmount)).toBeCloseTo(sumBaseAmount, 2);
      expect(parseFloat(report.summary.totalDeductions)).toBeCloseTo(sumDeductions, 2);
      expect(parseFloat(report.summary.totalBonuses)).toBeCloseTo(sumBonuses, 2);
      expect(parseFloat(report.summary.totalNetAmount)).toBeCloseTo(sumNetAmount, 2);
    });

    it('should include cost center details in reports', async () => {
      const report = await db.getAllFinancialReportsSummary(startDate, endDate);

      if (report.costCenterReports.length > 0) {
        const ccReport = report.costCenterReports[0];
        expect(ccReport.costCenterId).toBeDefined();
        expect(ccReport.costCenterCode).toBeDefined();
        expect(ccReport.costCenterName).toBeDefined();
        expect(ccReport.totalGroups).toBeGreaterThanOrEqual(0);
        expect(ccReport.totalWorkers).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Date Range Filtering', () => {
    it('should respect date range boundaries', async () => {
      const singleDayStart = new Date('2026-01-10');
      const singleDayEnd = new Date('2026-01-10');
      
      const report = await db.getWorkerFinancialReport(testWorkerId, singleDayStart, singleDayEnd);

      expect(report.period.startDate).toEqual(singleDayStart);
      expect(report.period.endDate).toEqual(singleDayEnd);
      
      // Should only include records from that single day
      report.dailyRecords.forEach(record => {
        const recordDate = new Date(record.workDate);
        expect(recordDate >= singleDayStart && recordDate <= singleDayEnd).toBe(true);
      });
    });

    it('should return empty report for date range with no data', async () => {
      const futureStart = new Date('2027-01-01');
      const futureEnd = new Date('2027-01-31');
      
      const report = await db.getWorkerFinancialReport(testWorkerId, futureStart, futureEnd);

      expect(report.summary.totalDaysWorked).toBe(0);
      expect(parseFloat(report.summary.totalBaseAmount)).toBe(0);
      expect(report.dailyRecords.length).toBe(0);
    });
  });

  describe('Financial Calculations', () => {
    it('should handle empty date ranges gracefully', async () => {
      // Test with a date range that has no data
      const emptyStart = new Date('2025-01-01');
      const emptyEnd = new Date('2025-01-01');
      
      const report = await db.getWorkerFinancialReport(testWorkerId, emptyStart, emptyEnd);
      
      expect(report.summary.totalDaysWorked).toBe(0);
      expect(parseFloat(report.summary.totalBaseAmount)).toBe(0);
      expect(parseFloat(report.summary.totalNetAmount)).toBe(0);
    });

    it('should handle decimal precision correctly', async () => {
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      // All amounts should be strings with 2 decimal places
      expect(report.summary.totalBaseAmount).toMatch(/^\d+\.\d{2}$/);
      expect(report.summary.totalDeductions).toMatch(/^\d+\.\d{2}$/);
      expect(report.summary.totalBonuses).toMatch(/^\d+\.\d{2}$/);
      expect(report.summary.totalNetAmount).toMatch(/^-?\d+\.\d{2}$/);
    });

    it('should include pay overrides in calculations', async () => {
      // Get report with overrides
      const report = await db.getWorkerFinancialReport(testWorkerId, startDate, endDate);

      if (report.overrides.length > 0) {
        // Calculate expected totals including overrides
        let expectedBonuses = 0;
        let expectedDeductions = 0;

        report.dailyRecords.forEach(record => {
          expectedBonuses += parseFloat(record.bonuses || '0');
          expectedDeductions += parseFloat(record.deductions || '0');
        });

        report.overrides.forEach(override => {
          const amount = parseFloat(override.amount);
          if (override.overrideType === 'bonus') {
            expectedBonuses += amount;
          } else if (override.overrideType === 'deduction') {
            expectedDeductions += amount;
          }
        });

        expect(parseFloat(report.summary.totalBonuses)).toBeCloseTo(expectedBonuses, 2);
        expect(parseFloat(report.summary.totalDeductions)).toBeCloseTo(expectedDeductions, 2);
      }
    });
  });
});
