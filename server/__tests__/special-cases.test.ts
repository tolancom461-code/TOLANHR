import { describe, it, expect } from 'vitest';
import {
  validateWorkerData,
  validateGroupData,
  validatePayrollData,
  validateAttendanceData,
  validatePeriodDates,
  validateSpecialCase,
} from '../validation';

describe('Special Cases and Edge Cases Testing', () => {
  describe('Leaves and Absences', () => {
    it('should validate annual leave', async () => {
      const result = validateSpecialCase({
        type: 'leave',
        duration: 480, // 8 hours
        reason: 'Annual leave',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate sick leave', async () => {
      const result = validateSpecialCase({
        type: 'leave',
        duration: 240, // 4 hours
        reason: 'Sick leave',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate absence', async () => {
      const result = validateSpecialCase({
        type: 'absence',
        duration: 480,
        reason: 'Unauthorized absence',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid leave duration', async () => {
      const result = validateSpecialCase({
        type: 'leave',
        duration: 2000, // Exceeds 24 hours
        reason: 'Invalid leave',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject missing reason for leave', async () => {
      const result = validateSpecialCase({
        type: 'leave',
        duration: 480,
        reason: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Overtime Cases', () => {
    it('should validate overtime hours', async () => {
      const result = validateSpecialCase({
        type: 'overtime',
        duration: 120, // 2 hours
        reason: 'Project deadline',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate multiple overtime entries', async () => {
      const overtimeEntries = [
        { type: 'overtime', duration: 120, reason: 'Project A' },
        { type: 'overtime', duration: 180, reason: 'Project B' },
        { type: 'overtime', duration: 60, reason: 'Project C' },
      ];

      overtimeEntries.forEach((entry) => {
        const result = validateSpecialCase(entry);
        expect(result.isValid).toBe(true);
      });
    });

    it('should reject excessive overtime', async () => {
      const result = validateSpecialCase({
        type: 'overtime',
        duration: 2000,
        reason: 'Excessive overtime',
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Attendance Edge Cases', () => {
    it('should validate early check-in', async () => {
      const result = validateAttendanceData({
        checkInTime: '07:30',
        checkOutTime: '17:00',
        workDate: '2026-02-15',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate late check-out', async () => {
      const result = validateAttendanceData({
        checkInTime: '08:00',
        checkOutTime: '18:30',
        workDate: '2026-02-15',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate full day attendance', async () => {
      const result = validateAttendanceData({
        checkInTime: '08:00',
        checkOutTime: '17:00',
        workDate: '2026-02-15',
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject invalid check-in time', async () => {
      const result = validateAttendanceData({
        checkInTime: '25:00',
        checkOutTime: '17:00',
        workDate: '2026-02-15',
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject check-out before check-in', async () => {
      const result = validateAttendanceData({
        checkInTime: '17:00',
        checkOutTime: '08:00',
        workDate: '2026-02-15',
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Payroll Calculation Edge Cases', () => {
    it('should validate normal payroll calculation', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 300,
        bonuses: 200,
        netAmount: 2900,
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate payroll with no deductions', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 0,
        bonuses: 200,
        netAmount: 3200,
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate payroll with no bonuses', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 300,
        bonuses: 0,
        netAmount: 2700,
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate payroll with high deductions', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 1500,
        bonuses: 0,
        netAmount: 1500,
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate payroll with high bonuses', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 0,
        bonuses: 2000,
        netAmount: 5000,
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject calculation mismatch', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 300,
        bonuses: 200,
        netAmount: 3500, // Should be 2900
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject negative deductions', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: -300,
        bonuses: 200,
        netAmount: 3500,
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject negative bonuses', async () => {
      const result = validatePayrollData({
        baseAmount: 3000,
        deductions: 300,
        bonuses: -200,
        netAmount: 2500,
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Period Validation Edge Cases', () => {
    it('should validate single day period', async () => {
      const result = validatePeriodDates('2026-02-15', '2026-02-15');
      expect(result.isValid).toBe(true);
    });

    it('should validate monthly period', async () => {
      const result = validatePeriodDates('2026-02-01', '2026-02-28');
      expect(result.isValid).toBe(true);
    });

    it('should validate quarterly period', async () => {
      const result = validatePeriodDates('2026-01-01', '2026-03-31');
      expect(result.isValid).toBe(true);
    });

    it('should validate annual period', async () => {
      const result = validatePeriodDates('2026-01-01', '2026-12-31');
      expect(result.isValid).toBe(true);
    });

    it('should reject period exceeding 365 days', async () => {
      const result = validatePeriodDates('2025-01-01', '2026-12-31');
      expect(result.isValid).toBe(false);
    });

    it('should reject end date before start date', async () => {
      const result = validatePeriodDates('2026-02-28', '2026-02-01');
      expect(result.isValid).toBe(false);
    });

    it('should reject invalid date format', async () => {
      const result = validatePeriodDates('02/15/2026', '2026-02-28');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Worker Data Edge Cases', () => {
    it('should validate worker with minimum data', async () => {
      const result = validateWorkerData({
        fullName: 'John Doe',
        code: 'W001',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate worker with full data', async () => {
      const result = validateWorkerData({
        fullName: 'John Doe',
        code: 'W001',
        groupId: 1,
        dailyRate: 300,
        status: 'active',
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject empty worker name', async () => {
      const result = validateWorkerData({
        fullName: '',
        code: 'W001',
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject very long worker name', async () => {
      const result = validateWorkerData({
        fullName: 'A'.repeat(300),
        code: 'W001',
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject negative daily rate', async () => {
      const result = validateWorkerData({
        fullName: 'John Doe',
        code: 'W001',
        dailyRate: -100,
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject invalid status', async () => {
      const result = validateWorkerData({
        fullName: 'John Doe',
        code: 'W001',
        status: 'unknown',
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Group Data Edge Cases', () => {
    it('should validate group with minimum data', async () => {
      const result = validateGroupData({
        name: 'Group A',
        code: 'G001',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate group with full data', async () => {
      const result = validateGroupData({
        name: 'Group A',
        code: 'G001',
        dailyWage: 300,
        workMinutes: 480,
        latePenaltyRate: 0.5,
        earlyLeavePenaltyRate: 0.5,
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
      });

      expect(result.isValid).toBe(true);
    });

    it('should accept valid group data', async () => {
      const result = validateGroupData({
        name: 'Group A',
        code: 'G001',
        dailyWage: 100,
        workMinutes: 480,
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject penalty rate exceeding 100%', async () => {
      const result = validateGroupData({
        name: 'Group A',
        code: 'G001',
        latePenaltyRate: 150,
      });

      expect(result.isValid).toBe(false);
    });

    it('should reject work minutes exceeding 24 hours', async () => {
      const result = validateGroupData({
        name: 'Group A',
        code: 'G001',
        workMinutes: 2000,
      });

      expect(result.isValid).toBe(false);
    });
  });

  describe('Holiday and Special Days', () => {
    it('should validate holiday special case', async () => {
      const result = validateSpecialCase({
        type: 'holiday',
        duration: 480,
        reason: 'National holiday',
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate multiple holidays in period', async () => {
      const holidays = [
        { type: 'holiday', duration: 480, reason: 'Holiday 1' },
        { type: 'holiday', duration: 480, reason: 'Holiday 2' },
        { type: 'holiday', duration: 480, reason: 'Holiday 3' },
      ];

      holidays.forEach((holiday) => {
        const result = validateSpecialCase(holiday);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Comprehensive Scenario Testing', () => {
    it('should handle complex payroll scenario with multiple special cases', async () => {
      // Scenario: Worker with leaves, overtime, and bonuses
      const workerValidation = validateWorkerData({
        fullName: 'Ahmed Hassan',
        code: 'W123',
        groupId: 1,
        dailyRate: 300,
        status: 'active',
      });

      const leaveValidation = validateSpecialCase({
        type: 'leave',
        duration: 240,
        reason: 'Sick leave',
      });

      const overtimeValidation = validateSpecialCase({
        type: 'overtime',
        duration: 120,
        reason: 'Project deadline',
      });

      const payrollValidation = validatePayrollData({
        baseAmount: 3000,
        deductions: 300,
        bonuses: 500,
        netAmount: 3200,
      });

      expect(workerValidation.isValid).toBe(true);
      expect(leaveValidation.isValid).toBe(true);
      expect(overtimeValidation.isValid).toBe(true);
      expect(payrollValidation.isValid).toBe(true);
    });

    it('should handle end-of-month payroll with various adjustments', async () => {
      const periodValidation = validatePeriodDates('2026-02-01', '2026-02-28');

      const payrollWithAdjustments = validatePayrollData({
        baseAmount: 6000,
        deductions: 600,
        bonuses: 1000,
        netAmount: 6400,
      });

      expect(periodValidation.isValid).toBe(true);
      expect(payrollWithAdjustments.isValid).toBe(true);
    });
  });
});
