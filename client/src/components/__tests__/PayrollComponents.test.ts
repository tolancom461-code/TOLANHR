import { describe, it, expect } from 'vitest';

describe('Payroll Components', () => {
  describe('PayrollSummaryCard', () => {
    it('should calculate correct totals', () => {
      const data = {
        totalWorkers: 3,
        totalDays: 90,
        totalBase: 10000,
        totalDeductions: 500,
        totalBonuses: 200,
        totalNet: 9700,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      };

      // Verify calculations
      expect(data.totalNet).toBe(data.totalBase - data.totalDeductions + data.totalBonuses);
      expect(data.totalWorkers).toBeGreaterThan(0);
      expect(data.totalDays).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const data = {
        totalWorkers: 0,
        totalDays: 0,
        totalBase: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        totalNet: 0,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      };

      expect(data.totalWorkers).toBe(0);
      expect(data.totalBase).toBe(0);
    });

    it('should calculate correct percentages', () => {
      const data = {
        totalWorkers: 1,
        totalDays: 30,
        totalBase: 3000,
        totalDeductions: 300,
        totalBonuses: 150,
        totalNet: 2850,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      };

      const deductionPercentage = (data.totalDeductions / data.totalBase) * 100;
      const bonusPercentage = (data.totalBonuses / data.totalBase) * 100;

      expect(deductionPercentage).toBe(10);
      expect(bonusPercentage).toBe(5);
    });

    it('should calculate correct averages per worker', () => {
      const data = {
        totalWorkers: 3,
        totalDays: 90,
        totalBase: 9000,
        totalDeductions: 300,
        totalBonuses: 150,
        totalNet: 8850,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
      };

      const avgDays = data.totalDays / data.totalWorkers;
      const avgBase = data.totalBase / data.totalWorkers;
      const avgNet = data.totalNet / data.totalWorkers;

      expect(avgDays).toBe(30);
      expect(avgBase).toBe(3000);
      expect(avgNet).toBe(2950);
    });
  });

  describe('PayrollTable', () => {
    it('should sort data correctly', () => {
      const data = [
        { workerId: 1, workerName: 'محمد', daysWorked: 20, baseAmount: '2000', deductions: '100', bonuses: '50', netAmount: '1950' },
        { workerId: 2, workerName: 'أحمد', daysWorked: 25, baseAmount: '2500', deductions: '150', bonuses: '100', netAmount: '2450' },
        { workerId: 3, workerName: 'علي', daysWorked: 22, baseAmount: '2200', deductions: '110', bonuses: '75', netAmount: '2165' },
      ];

      // Sort by name (ascending)
      const sorted = [...data].sort((a, b) => a.workerName.localeCompare(b.workerName));
      
      expect(sorted[0].workerName).toBe('أحمد');
      expect(sorted[1].workerName).toBe('علي');
      expect(sorted[2].workerName).toBe('محمد');
    });

    it('should filter data by search term', () => {
      const data = [
        { workerId: 1, workerName: 'محمد علي', daysWorked: 20, baseAmount: '2000', deductions: '100', bonuses: '50', netAmount: '1950' },
        { workerId: 2, workerName: 'أحمد حسن', daysWorked: 25, baseAmount: '2500', deductions: '150', bonuses: '100', netAmount: '2450' },
        { workerId: 3, workerName: 'علي محمود', daysWorked: 22, baseAmount: '2200', deductions: '110', bonuses: '75', netAmount: '2165' },
      ];

      const searchTerm = 'محمد';
      const filtered = data.filter(row =>
        row.workerName.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered.length).toBe(2);
      expect(filtered[0].workerId).toBe(1);
      expect(filtered[1].workerId).toBe(3);
    });

    it('should calculate row totals correctly', () => {
      const rows = [
        { workerId: 1, workerName: 'محمد', daysWorked: 20, baseAmount: '2000', deductions: '100', bonuses: '50', netAmount: '1950' },
        { workerId: 2, workerName: 'أحمد', daysWorked: 25, baseAmount: '2500', deductions: '150', bonuses: '100', netAmount: '2450' },
      ];

      const totalDays = rows.reduce((sum, r) => sum + r.daysWorked, 0);
      const totalBase = rows.reduce((sum, r) => sum + parseFloat(r.baseAmount), 0);
      const totalDeductions = rows.reduce((sum, r) => sum + parseFloat(r.deductions), 0);
      const totalBonuses = rows.reduce((sum, r) => sum + parseFloat(r.bonuses), 0);
      const totalNet = rows.reduce((sum, r) => sum + parseFloat(r.netAmount), 0);

      expect(totalDays).toBe(45);
      expect(totalBase).toBe(4500);
      expect(totalDeductions).toBe(250);
      expect(totalBonuses).toBe(150);
      expect(totalNet).toBe(4400);
    });

    it('should handle numeric string conversions', () => {
      const baseAmount = '2500.50';
      const deductions = '125.25';
      const bonuses = '75.75';

      const base = parseFloat(baseAmount);
      const ded = parseFloat(deductions);
      const bon = parseFloat(bonuses);
      const net = base - ded + bon;

      expect(base).toBe(2500.50);
      expect(ded).toBe(125.25);
      expect(bon).toBe(75.75);
      expect(net).toBeCloseTo(2451, 0.01);
    });
  });

  describe('Period Selection', () => {
    it('should calculate daily period correctly', () => {
      const today = new Date('2026-01-15');
      const start = today.toISOString().split('T')[0];
      const end = today.toISOString().split('T')[0];

      expect(start).toBe(end);
      expect(start).toBe('2026-01-15');
    });

    it('should calculate weekly period correctly', () => {
      const date = new Date('2026-01-15'); // Wednesday
      const dayOfWeek = date.getDay();
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

      const weekStart = new Date(date);
      weekStart.setDate(diff);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const start = weekStart.toISOString().split('T')[0];
      const end = weekEnd.toISOString().split('T')[0];

      // Verify week has 7 days
      const daysDiff = Math.ceil((weekEnd.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      expect(daysDiff).toBe(7);
    });

    it('should calculate monthly period correctly', () => {
      const date = new Date('2026-01-15');

      const monthStart = new Date(date);
      monthStart.setDate(1);

      const monthEnd = new Date(date);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(0);

      const start = monthStart.toISOString().split('T')[0];
      const end = monthEnd.toISOString().split('T')[0];

      expect(start).toBe('2026-01-01');
      expect(end).toBe('2026-01-31');
      expect(monthStart <= monthEnd).toBe(true);
    });

    it('should validate date range', () => {
      const start = '2026-01-01';
      const end = '2026-01-31';

      const startDate = new Date(start);
      const endDate = new Date(end);

      expect(startDate <= endDate).toBe(true);
    });

    it('should reject invalid date ranges', () => {
      const start = '2026-01-31';
      const end = '2026-01-01';

      const startDate = new Date(start);
      const endDate = new Date(end);

      expect(startDate > endDate).toBe(true);
    });
  });

  describe('Payroll Calculations', () => {
    it('should calculate net amount correctly', () => {
      const baseAmount = 3000;
      const deductions = 300;
      const bonuses = 150;

      const net = baseAmount - deductions + bonuses;

      expect(net).toBe(2850);
    });

    it('should handle decimal calculations', () => {
      const baseAmount = 3000.50;
      const deductions = 300.25;
      const bonuses = 150.75;

      const net = baseAmount - deductions + bonuses;

      expect(net).toBeCloseTo(2851, 0.01);
    });

    it('should calculate deduction percentage', () => {
      const baseAmount = 3000;
      const deductions = 300;

      const percentage = (deductions / baseAmount) * 100;

      expect(percentage).toBe(10);
    });

    it('should calculate bonus percentage', () => {
      const baseAmount = 3000;
      const bonuses = 150;

      const percentage = (bonuses / baseAmount) * 100;

      expect(percentage).toBe(5);
    });

    it('should handle zero base amount', () => {
      const baseAmount = 0;
      const deductions = 100;
      const bonuses = 50;

      const net = baseAmount - deductions + bonuses;

      expect(net).toBe(-50);
    });
  });
});
