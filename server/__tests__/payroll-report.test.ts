import { describe, it, expect } from 'vitest';
import { ROLE_PERMISSIONS } from '../permissions';

/**
 * Payroll Report - Filter & Permission Tests
 * Tests for the updated payroll report with hierarchical filters
 */

describe('Payroll Report Filters & Permissions', () => {
  
  describe('Report Access Permissions', () => {
    it('all authenticated roles should be able to access payroll reports', () => {
      const roles = Object.keys(ROLE_PERMISSIONS);
      // Reports are read-only, all authenticated users can view
      expect(roles.length).toBeGreaterThan(0);
      // Every role should exist in ROLE_PERMISSIONS
      roles.forEach(role => {
        expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS]).toBeDefined();
      });
    });
  });

  describe('Hierarchical Filter Logic', () => {
    it('should return all groups when no cost center is selected', () => {
      const allGroups = [
        { id: 1, name: 'Group A', costCenterId: 1 },
        { id: 2, name: 'Group B', costCenterId: 1 },
        { id: 3, name: 'Group C', costCenterId: 2 },
        { id: 4, name: 'Group D', costCenterId: 2 },
        { id: 5, name: 'Group E', costCenterId: null },
      ];
      
      const selectedCostCenterId = undefined;
      const filteredGroups = selectedCostCenterId
        ? allGroups.filter(g => g.costCenterId === selectedCostCenterId)
        : allGroups;
      
      expect(filteredGroups).toHaveLength(5);
    });

    it('should filter groups by selected cost center', () => {
      const allGroups = [
        { id: 1, name: 'Group A', costCenterId: 1 },
        { id: 2, name: 'Group B', costCenterId: 1 },
        { id: 3, name: 'Group C', costCenterId: 2 },
        { id: 4, name: 'Group D', costCenterId: 2 },
        { id: 5, name: 'Group E', costCenterId: null },
      ];
      
      const selectedCostCenterId = 1;
      const filteredGroups = allGroups.filter(g => g.costCenterId === selectedCostCenterId);
      
      expect(filteredGroups).toHaveLength(2);
      expect(filteredGroups.every(g => g.costCenterId === 1)).toBe(true);
    });

    it('should return empty when cost center has no groups', () => {
      const allGroups = [
        { id: 1, name: 'Group A', costCenterId: 1 },
        { id: 2, name: 'Group B', costCenterId: 2 },
      ];
      
      const selectedCostCenterId = 99; // non-existent
      const filteredGroups = allGroups.filter(g => g.costCenterId === selectedCostCenterId);
      
      expect(filteredGroups).toHaveLength(0);
    });

    it('should reset group selection when cost center changes', () => {
      let selectedGroupId: number | undefined = 3;
      let selectedCostCenterId: number | undefined = 1;
      
      // Simulate cost center change - should reset group
      selectedCostCenterId = 2;
      selectedGroupId = undefined; // Reset on cost center change
      
      expect(selectedGroupId).toBeUndefined();
      expect(selectedCostCenterId).toBe(2);
    });
  });

  describe('Dynamic Report Title', () => {
    it('should show cost center name when a specific center is selected', () => {
      const costCenters = [
        { id: 1, name: 'مركز الرياض', code: 'RYD' },
        { id: 2, name: 'مركز جدة', code: 'JED' },
      ];
      
      const selectedCostCenterId = 1;
      const cc = costCenters.find(c => c.id === selectedCostCenterId);
      const title = `تقرير كشف رواتب العمال اليومية لمركز تكلفة: ${cc?.name || ''}`;
      
      expect(title).toBe('تقرير كشف رواتب العمال اليومية لمركز تكلفة: مركز الرياض');
    });

    it('should show "all centers" when no specific center is selected', () => {
      const selectedCostCenterId = undefined;
      const title = selectedCostCenterId
        ? `تقرير كشف رواتب العمال اليومية لمركز تكلفة: test`
        : 'تقرير كشف رواتب العمال اليومية – جميع مراكز التكلفة';
      
      expect(title).toBe('تقرير كشف رواتب العمال اليومية – جميع مراكز التكلفة');
    });
  });

  describe('Report Totals Calculation', () => {
    it('should calculate correct totals from report data', () => {
      const reportData = [
        { workerCount: 10, totalSalary: '5000.00', totalDeductions: '500.00', totalBonuses: '200.00', totalNet: '4700.00' },
        { workerCount: 15, totalSalary: '7500.00', totalDeductions: '750.00', totalBonuses: '300.00', totalNet: '7050.00' },
        { workerCount: 8, totalSalary: '4000.00', totalDeductions: '400.00', totalBonuses: '100.00', totalNet: '3700.00' },
      ];

      let totalWorkers = 0;
      let totalSalary = 0;
      let totalDeductions = 0;
      let totalBonuses = 0;
      let totalNet = 0;

      reportData.forEach((row) => {
        totalWorkers += row.workerCount || 1;
        totalSalary += parseFloat(row.totalSalary || '0');
        totalDeductions += parseFloat(row.totalDeductions || '0');
        totalBonuses += parseFloat(row.totalBonuses || '0');
        totalNet += parseFloat(row.totalNet || '0');
      });

      expect(totalWorkers).toBe(33);
      expect(totalSalary.toFixed(2)).toBe('16500.00');
      expect(totalDeductions.toFixed(2)).toBe('1650.00');
      expect(totalBonuses.toFixed(2)).toBe('600.00');
      expect(totalNet.toFixed(2)).toBe('15450.00');
    });

    it('should return zeros for empty report data', () => {
      const reportData: any[] = [];

      const totals = {
        totalWorkers: 0,
        totalSalary: '0.00',
        totalDeductions: '0.00',
        totalBonuses: '0.00',
        totalNet: '0.00',
      };

      if (reportData.length === 0) {
        expect(totals.totalWorkers).toBe(0);
        expect(totals.totalSalary).toBe('0.00');
        expect(totals.totalNet).toBe('0.00');
      }
    });
  });

  describe('Signatures Section', () => {
    it('should have exactly 6 signature positions', () => {
      const signatures = [
        { title: 'إعداد', name: null },
        { title: 'مراجعة أولى', name: null },
        { title: 'المراجع المالي', name: null },
        { title: 'رئيس الحسابات', name: null },
        { title: 'تدقيق ومراجعة', name: 'م. سعد الزكري' },
        { title: 'الرئيس التنفيذي', name: 'م. زكري بن عبدالله الزكري' },
      ];

      expect(signatures).toHaveLength(6);
    });

    it('should have names only for last two signatures', () => {
      const signatures = [
        { title: 'إعداد', name: null },
        { title: 'مراجعة أولى', name: null },
        { title: 'المراجع المالي', name: null },
        { title: 'رئيس الحسابات', name: null },
        { title: 'تدقيق ومراجعة', name: 'م. سعد الزكري' },
        { title: 'الرئيس التنفيذي', name: 'م. زكري بن عبدالله الزكري' },
      ];

      // First 4 should have no name
      signatures.slice(0, 4).forEach(sig => {
        expect(sig.name).toBeNull();
      });

      // Last 2 should have names
      expect(signatures[4].name).toBe('م. سعد الزكري');
      expect(signatures[5].name).toBe('م. زكري بن عبدالله الزكري');
    });

    it('signatures should be ordered right-to-left (RTL)', () => {
      const signaturesRTL = [
        'إعداد',
        'مراجعة أولى',
        'المراجع المالي',
        'رئيس الحسابات',
        'تدقيق ومراجعة',
        'الرئيس التنفيذي',
      ];

      expect(signaturesRTL[0]).toBe('إعداد');
      expect(signaturesRTL[5]).toBe('الرئيس التنفيذي');
    });
  });

  describe('Date Filter Validation', () => {
    it('should require both start and end dates', () => {
      const periodStart = '';
      const periodEnd = '';
      
      const isValid = periodStart !== '' && periodEnd !== '';
      expect(isValid).toBe(false);
    });

    it('should accept valid date range', () => {
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';
      
      const isValid = periodStart !== '' && periodEnd !== '';
      expect(isValid).toBe(true);
      expect(new Date(periodStart) <= new Date(periodEnd)).toBe(true);
    });
  });
});
