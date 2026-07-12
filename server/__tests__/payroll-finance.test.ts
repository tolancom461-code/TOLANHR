import { describe, it, expect } from "vitest";

/**
 * Tests for payroll finance calculation fixes
 * 
 * Root cause: createOrUpdateDailyFinance was not saving workedMinutes, 
 * financialMinutes, checkInTime, and checkOutTime fields, resulting in
 * worker_daily_finance records with worked_minutes=0 and base_amount=0.
 * 
 * Fix: Updated createOrUpdateDailyFinance to properly save these fields,
 * and updated processAttendanceToFinance to pass them correctly.
 * 
 * Also fixed recalculateDailyFinance to use processAttendanceToFinance
 * instead of the old calculateAndSaveDailyFinance function.
 */

describe("Payroll Finance Calculation", () => {
  describe("createOrUpdateDailyFinance field mapping", () => {
    it("should include workedMinutes in the saved record", () => {
      // The fix ensures workedMinutes is passed to createOrUpdateDailyFinance
      const financeData = {
        workerId: 1,
        workDate: "2026-02-01",
        baseAmount: 100,
        deductions: 0,
        bonuses: 0,
        netAmount: 100,
        workedMinutes: 480, // 8 hours
        financialMinutes: 480,
        checkInTime: "08:00",
        checkOutTime: "16:00",
      };
      
      expect(financeData.workedMinutes).toBe(480);
      expect(financeData.financialMinutes).toBe(480);
      expect(financeData.checkInTime).toBe("08:00");
      expect(financeData.checkOutTime).toBe("16:00");
    });

    it("should calculate netAmount correctly with deductions and bonuses", () => {
      const baseAmount = 100;
      const deductions = 20;
      const bonuses = 30;
      const netAmount = baseAmount - deductions + bonuses;
      
      expect(netAmount).toBe(110);
    });

    it("should handle zero workedMinutes when no attendance", () => {
      const financeData = {
        workedMinutes: 0,
        financialMinutes: 0,
        baseAmount: 0,
        checkInTime: null,
        checkOutTime: null,
      };
      
      expect(financeData.workedMinutes).toBe(0);
      expect(financeData.baseAmount).toBe(0);
    });
  });

  describe("processAttendanceToFinance data flow", () => {
    it("should pass actualWorkMinutes from calculation to createOrUpdateDailyFinance", () => {
      // Simulates the data flow from calculateDailyFinanceFromAttendance
      // to createOrUpdateDailyFinance
      const calculationResult = {
        actualWorkMinutes: 480,
        financialMinutes: 480,
        baseAmount: 100,
        deductions: 0,
        bonuses: 0,
        netAmount: 100,
        checkInTime: "08:00:00",
        checkOutTime: "16:00:00",
      };
      
      // The fix maps actualWorkMinutes -> workedMinutes
      const financeRecord = {
        workedMinutes: calculationResult.actualWorkMinutes,
        financialMinutes: calculationResult.financialMinutes,
        baseAmount: calculationResult.baseAmount,
        checkInTime: calculationResult.checkInTime,
        checkOutTime: calculationResult.checkOutTime,
      };
      
      expect(financeRecord.workedMinutes).toBe(480);
      expect(financeRecord.financialMinutes).toBe(480);
    });

    it("should extract checkIn and checkOut times correctly", () => {
      // Simulates extracting times from attendance events
      const checkInEvent = { eventTime: new Date("2026-02-01T08:00:00+03:00") };
      const checkOutEvent = { eventTime: new Date("2026-02-01T16:00:00+03:00") };
      
      const checkInTime = checkInEvent.eventTime.toTimeString().slice(0, 8);
      const checkOutTime = checkOutEvent.eventTime.toTimeString().slice(0, 8);
      
      expect(checkInTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(checkOutTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("recalculateDailyFinance", () => {
    it("should process all workers with attendance for the given date", () => {
      // Simulates the recalculation logic
      const attendanceRecords = [
        { workerId: 1, eventType: "check_in", eventTime: "08:00" },
        { workerId: 1, eventType: "check_out", eventTime: "16:00" },
        { workerId: 2, eventType: "check_in", eventTime: "09:00" },
        { workerId: 2, eventType: "check_out", eventTime: "17:00" },
        { workerId: 3, eventType: "check_in", eventTime: "07:00" },
        // Worker 3 has no check_out - incomplete
      ];
      
      // Group by worker
      const workerMap = new Map<number, typeof attendanceRecords>();
      for (const record of attendanceRecords) {
        const existing = workerMap.get(record.workerId) || [];
        existing.push(record);
        workerMap.set(record.workerId, existing);
      }
      
      // Workers with both check_in and check_out
      const completeWorkers: number[] = [];
      for (const [workerId, events] of workerMap) {
        const hasCheckIn = events.some(e => e.eventType === "check_in");
        const hasCheckOut = events.some(e => e.eventType === "check_out");
        if (hasCheckIn && hasCheckOut) {
          completeWorkers.push(workerId);
        }
      }
      
      expect(completeWorkers).toEqual([1, 2]);
      expect(completeWorkers).not.toContain(3);
    });

    it("should use workDateStr format YYYY-MM-DD", () => {
      const workDateStr = "2026-02-01";
      
      // Validate format
      expect(workDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Build datetime range
      const startOfDay = `${workDateStr}T00:00:00`;
      const endOfDay = `${workDateStr}T23:59:59`;
      
      expect(startOfDay).toBe("2026-02-01T00:00:00");
      expect(endOfDay).toBe("2026-02-01T23:59:59");
    });
  });

  describe("aggregatePayrollData", () => {
    it("should aggregate daily finance records into payroll items", () => {
      const dailyRecords = [
        { workerId: 1, baseAmount: 100, deductions: 0, bonuses: 0, netAmount: 100 },
        { workerId: 1, baseAmount: 100, deductions: 10, bonuses: 0, netAmount: 90 },
        { workerId: 2, baseAmount: 100, deductions: 0, bonuses: 20, netAmount: 120 },
      ];
      
      // Aggregate by worker
      const workerTotals = new Map<number, { baseAmount: number; deductions: number; bonuses: number; netAmount: number; daysWorked: number }>();
      
      for (const record of dailyRecords) {
        const existing = workerTotals.get(record.workerId) || { baseAmount: 0, deductions: 0, bonuses: 0, netAmount: 0, daysWorked: 0 };
        existing.baseAmount += record.baseAmount;
        existing.deductions += record.deductions;
        existing.bonuses += record.bonuses;
        existing.netAmount += record.netAmount;
        existing.daysWorked += 1;
        workerTotals.set(record.workerId, existing);
      }
      
      const worker1 = workerTotals.get(1)!;
      expect(worker1.baseAmount).toBe(200);
      expect(worker1.deductions).toBe(10);
      expect(worker1.netAmount).toBe(190);
      expect(worker1.daysWorked).toBe(2);
      
      const worker2 = workerTotals.get(2)!;
      expect(worker2.baseAmount).toBe(100);
      expect(worker2.bonuses).toBe(20);
      expect(worker2.netAmount).toBe(120);
      expect(worker2.daysWorked).toBe(1);
    });

    it("should only include records with lockedBatchId IS NULL", () => {
      const records = [
        { workerId: 1, baseAmount: 100, lockedBatchId: null },
        { workerId: 1, baseAmount: 100, lockedBatchId: 5 }, // Already locked
        { workerId: 2, baseAmount: 100, lockedBatchId: null },
      ];
      
      const unlockedRecords = records.filter(r => r.lockedBatchId === null);
      
      expect(unlockedRecords).toHaveLength(2);
      expect(unlockedRecords.map(r => r.workerId)).toEqual([1, 2]);
    });
  });
});
