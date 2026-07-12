import { describe, expect, it } from 'vitest';
import { 
  calculateMinuteCost, 
  calculateLatePenalty, 
  calculateEarlyLeavePenalty,
  calculateDailyFinanceFromAttendance 
} from '../db';

describe('Work Group Settings - Calculation Functions', () => {
  describe('calculateMinuteCost', () => {
    it('should calculate minute cost correctly', () => {
      const result = calculateMinuteCost(150, 480);
      expect(result).toBe(0.3125); // 150 / 480 = 0.3125 (4 decimal places)
    });

    it('should return null when dailyWage is null', () => {
      const result = calculateMinuteCost(null, 480);
      expect(result).toBeNull();
    });

    it('should return null when workMinutes is null', () => {
      const result = calculateMinuteCost(150, null);
      expect(result).toBeNull();
    });

    it('should return null when workMinutes is zero', () => {
      const result = calculateMinuteCost(150, 0);
      expect(result).toBeNull();
    });
  });

  describe('calculateLatePenalty', () => {
    it('should calculate late penalty without penalty rate', () => {
      const result = calculateLatePenalty(150, 480, 30, null);
      // When penalty rate is null, the function returns 0 (no penalty applied)
      expect(result).toBe(0);
    });

    it('should calculate late penalty with penalty rate (50 = 50%)', () => {
      // latePenaltyRate is stored as percentage: 50 means 50% = 0.5x multiplier
      const result = calculateLatePenalty(150, 480, 30, 50);
      // (150 / 480) * 30 * (50/100) = 0.3125 * 30 * 0.5 = 4.6875 rounded to 4.69
      expect(result).toBe(4.69);
    });

    it('should return 0 when lateMinutes is 0', () => {
      const result = calculateLatePenalty(150, 480, 0, 50);
      expect(result).toBe(0);
    });

    it('should return 0 when dailyWage is null', () => {
      const result = calculateLatePenalty(null, 480, 30, 50);
      expect(result).toBe(0);
    });

    it('should return 0 when workMinutes is null', () => {
      const result = calculateLatePenalty(150, null, 30, 50);
      expect(result).toBe(0);
    });
  });

  describe('calculateEarlyLeavePenalty', () => {
    it('should calculate early leave penalty without penalty rate', () => {
      const result = calculateEarlyLeavePenalty(150, 480, 45, null);
      // When penalty rate is null, the function returns 0 (no penalty applied)
      expect(result).toBe(0);
    });

    it('should calculate early leave penalty with penalty rate (50 = 50%)', () => {
      // earlyLeavePenaltyRate is stored as percentage: 50 means 50% = 0.5x multiplier
      const result = calculateEarlyLeavePenalty(150, 480, 45, 50);
      // (150 / 480) * 45 * (50/100) = 0.3125 * 45 * 0.5 = 7.03125 rounded to 7.03
      expect(result).toBe(7.03);
    });

    it('should return 0 when earlyLeaveMinutes is 0', () => {
      const result = calculateEarlyLeavePenalty(150, 480, 0, 50);
      expect(result).toBe(0);
    });

    it('should return 0 when dailyWage is null', () => {
      const result = calculateEarlyLeavePenalty(null, 480, 45, 50);
      expect(result).toBe(0);
    });

    it('should return 0 when workMinutes is null', () => {
      const result = calculateEarlyLeavePenalty(150, null, 45, 50);
      expect(result).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small daily wage', () => {
      const result = calculateMinuteCost(10, 480);
      expect(result).toBe(0.0208); // 10 / 480 = 0.020833 rounded to 4 decimals
    });

    it('should handle very large daily wage', () => {
      const result = calculateMinuteCost(1000, 480);
      expect(result).toBe(2.0833); // 1000 / 480 = 2.083333 rounded to 4 decimals
    });

    it('should handle very small work minutes', () => {
      const result = calculateMinuteCost(150, 60);
      expect(result).toBe(2.5); // 150 / 60 = 2.5
    });

    it('should handle very large work minutes', () => {
      const result = calculateMinuteCost(150, 720);
      expect(result).toBe(0.2083); // 150 / 720 = 0.208333 rounded to 4 decimals
    });

    it('should handle penalty rate of 0', () => {
      const result = calculateLatePenalty(150, 480, 30, 0);
      // When penalty rate is 0, the function returns 0 (no penalty applied)
      expect(result).toBe(0);
    });

    it('should handle penalty rate of 100 (100%)', () => {
      const result = calculateLatePenalty(150, 480, 30, 100);
      // (150 / 480) * 30 * (100/100) = 0.3125 * 30 * 1 = 9.375 rounded to 9.38
      expect(result).toBe(9.38);
    });

    it('should handle penalty rate of 200 (200%)', () => {
      const result = calculateEarlyLeavePenalty(150, 480, 30, 200);
      // (150 / 480) * 30 * (200/100) = 0.3125 * 30 * 2 = 18.75
      expect(result).toBe(18.75);
    });
  });
});
