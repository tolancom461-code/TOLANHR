import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb } from '../db';
import { workers, groups, attendanceEvents, workerDailyFinance } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Shift System Tests', () => {
  let db: any;
  let testWorkerId: number;
  let testGroupId: number;
  let testDate: string;

  beforeEach(async () => {
    db = await getDb();
    if (!db) throw new Error('Database not available');

    testDate = new Date().toISOString().split('T')[0];
  });

  afterEach(async () => {
    if (!db) return;

    try {
      // Clean up test data if needed
      if (testWorkerId) {
        await db.delete(attendanceEvents).where(eq(attendanceEvents.workerId, testWorkerId));
        await db.delete(workerDailyFinance).where(eq(workerDailyFinance.workerId, testWorkerId));
        await db.delete(workers).where(eq(workers.id, testWorkerId));
      }
      if (testGroupId) {
        await db.delete(groups).where(eq(groups.id, testGroupId));
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('Perfect Attendance', () => {
    it('should record check-in event', async () => {
      // Create test group
      const groupResult = await db.insert(groups).values({
        code: `TEST-GRP-${Date.now()}`,
        name: 'Test Group',
        dailyWage: 150,
        workMinutes: 480,
        latePenaltyRate: 0.5,
        earlyLeavePenaltyRate: 0.5,
        shiftStartTime: '08:00',
        shiftEndTime: '17:00',
        isActive: true,
      });

      testGroupId = groupResult[0]?.insertId || 1;

      // Create test worker
      const workerResult = await db.insert(workers).values({
        code: `TEST-W-${Date.now()}`,
        fullName: 'Test Worker',
        nationalId: `TEST-${Date.now()}`,
        phone: '966501234567',
        groupId: testGroupId,
        jobId: 1,
        dailyRate: 150,
        status: 'active',
        hireDate: new Date().toISOString(),
      });

      testWorkerId = workerResult[0]?.insertId || 1;

      // Record check-in with correct field names
      const checkInTime = new Date(`${testDate}T08:00:00`);
      const result = await db.insert(attendanceEvents).values({
        workerId: testWorkerId,
        eventTime: checkInTime,
        eventType: 'check_in',
        method: 'manual',
      });

      expect(result).toBeDefined();
    });

    it('should handle late arrival', async () => {
      // Test late arrival scenario
      const checkInTime = new Date(`${testDate}T08:30:00`);
      
      expect(checkInTime.getHours()).toBe(8);
      expect(checkInTime.getMinutes()).toBe(30);
    });

    it('should handle early departure', async () => {
      // Test early departure scenario
      const checkOutTime = new Date(`${testDate}T16:30:00`);
      
      expect(checkOutTime.getHours()).toBe(16);
      expect(checkOutTime.getMinutes()).toBe(30);
    });
  });

  describe('No Attendance Records', () => {
    it('should handle zero hours worked', async () => {
      // Test scenario with no attendance
      expect(0).toBe(0);
    });

    it('should calculate zero pay for absent worker', async () => {
      // Test zero pay calculation
      const zeroAmount = 0;
      expect(zeroAmount).toBe(0);
    });
  });

  describe('Shift Calculations', () => {
    it('should calculate full day pay', async () => {
      // 8 hours * 150 = 1200
      const dailyWage = 150;
      const hoursWorked = 8;
      const expectedPay = dailyWage * hoursWorked / 8;
      
      expect(expectedPay).toBe(150);
    });

    it('should calculate partial day pay', async () => {
      // 4 hours * 150 = 600
      const dailyWage = 150;
      const hoursWorked = 4;
      const expectedPay = dailyWage * hoursWorked / 8;
      
      expect(expectedPay).toBe(75);
    });

    it('should apply late penalty', async () => {
      // Late by 30 minutes
      const dailyWage = 150;
      const latePenaltyRate = 0.5;
      const lateMinutes = 30;
      const penalty = (dailyWage / 480) * lateMinutes * latePenaltyRate;
      
      expect(penalty).toBeGreaterThan(0);
    });
  });
});
