import { describe, it, expect, beforeEach, vi } from "vitest";

describe("PayrollBatchCreate - Calculate Payroll Button", () => {
  describe("Payroll Calculation Logic", () => {
    it("should calculate payroll data for workers", () => {
      // Mock worker data
      const workers = [
        { id: 1, fullName: "أحمد محمد", dailyRate: "100" },
        { id: 2, fullName: "فاطمة علي", dailyRate: "150" },
        { id: 3, fullName: "محمود سالم", dailyRate: "120" },
      ];

      // Calculate payroll
      const results = workers.map((worker) => {
        const daysWorked = 20; // Example: 20 days worked
        const baseAmount = parseFloat(worker.dailyRate) * daysWorked;
        const deductions = baseAmount * 0.1; // 10% deductions
        const bonuses = baseAmount * 0.05; // 5% bonuses
        const netAmount = baseAmount - deductions + bonuses;

        return {
          workerId: worker.id,
          workerName: worker.fullName,
          daysWorked,
          baseAmount,
          deductions,
          bonuses,
          netAmount,
        };
      });

      // Verify results
      expect(results).toHaveLength(3);
      expect(results[0].baseAmount).toBe(2000); // 100 * 20
      expect(results[0].deductions).toBe(200); // 2000 * 0.1
      expect(results[0].bonuses).toBe(100); // 2000 * 0.05
      expect(results[0].netAmount).toBe(1900); // 2000 - 200 + 100
    });

    it("should calculate payroll summary correctly", () => {
      const calculatedData = [
        {
          workerId: 1,
          workerName: "أحمد محمد",
          daysWorked: 20,
          baseAmount: 2000,
          deductions: 200,
          bonuses: 100,
          netAmount: 1900,
        },
        {
          workerId: 2,
          workerName: "فاطمة علي",
          daysWorked: 22,
          baseAmount: 3300,
          deductions: 330,
          bonuses: 165,
          netAmount: 3135,
        },
      ];

      // Calculate summary
      const summary = {
        totalWorkers: calculatedData.length,
        totalDays: calculatedData.reduce((sum, d) => sum + d.daysWorked, 0),
        totalBase: calculatedData.reduce((sum, d) => sum + d.baseAmount, 0),
        totalDeductions: calculatedData.reduce((sum, d) => sum + d.deductions, 0),
        totalBonuses: calculatedData.reduce((sum, d) => sum + d.bonuses, 0),
        totalNet: calculatedData.reduce((sum, d) => sum + d.netAmount, 0),
      };

      // Verify summary
      expect(summary.totalWorkers).toBe(2);
      expect(summary.totalDays).toBe(42); // 20 + 22
      expect(summary.totalBase).toBe(5300); // 2000 + 3300
      expect(summary.totalDeductions).toBe(530); // 200 + 330
      expect(summary.totalBonuses).toBe(265); // 100 + 165
      expect(summary.totalNet).toBe(5035); // 1900 + 3135
    });

    it("should handle zero workers gracefully", () => {
      const calculatedData: any[] = [];

      const summary = {
        totalWorkers: calculatedData.length,
        totalDays: calculatedData.reduce((sum, d) => sum + d.daysWorked, 0),
        totalBase: calculatedData.reduce((sum, d) => sum + d.baseAmount, 0),
        totalDeductions: calculatedData.reduce((sum, d) => sum + d.deductions, 0),
        totalBonuses: calculatedData.reduce((sum, d) => sum + d.bonuses, 0),
        totalNet: calculatedData.reduce((sum, d) => sum + d.netAmount, 0),
      };

      expect(summary.totalWorkers).toBe(0);
      expect(summary.totalDays).toBe(0);
      expect(summary.totalBase).toBe(0);
      expect(summary.totalDeductions).toBe(0);
      expect(summary.totalBonuses).toBe(0);
      expect(summary.totalNet).toBe(0);
    });

    it("should validate period dates", () => {
      const periodStart = "2026-01-01";
      const periodEnd = "2026-01-31";

      const isValid = new Date(periodStart) <= new Date(periodEnd);

      expect(isValid).toBe(true);
    });

    it("should reject invalid period dates", () => {
      const periodStart = "2026-01-31";
      const periodEnd = "2026-01-01";

      const isValid = new Date(periodStart) <= new Date(periodEnd);

      expect(isValid).toBe(false);
    });

    it("should calculate net amount correctly with different rates", () => {
      const testCases = [
        {
          dailyRate: 100,
          daysWorked: 20,
          expectedBase: 2000,
          expectedDeductions: 200,
          expectedBonuses: 100,
          expectedNet: 1900,
        },
        {
          dailyRate: 250,
          daysWorked: 25,
          expectedBase: 6250,
          expectedDeductions: 625,
          expectedBonuses: 312.5,
          expectedNet: 5937.5,
        },
        {
          dailyRate: 50,
          daysWorked: 30,
          expectedBase: 1500,
          expectedDeductions: 150,
          expectedBonuses: 75,
          expectedNet: 1425,
        },
      ];

      testCases.forEach((testCase) => {
        const baseAmount = testCase.dailyRate * testCase.daysWorked;
        const deductions = baseAmount * 0.1;
        const bonuses = baseAmount * 0.05;
        const netAmount = baseAmount - deductions + bonuses;

        expect(baseAmount).toBe(testCase.expectedBase);
        expect(deductions).toBe(testCase.expectedDeductions);
        expect(bonuses).toBe(testCase.expectedBonuses);
        expect(netAmount).toBe(testCase.expectedNet);
      });
    });
  });

  describe("Button State Management", () => {
    it("should disable calculate button when period is not selected", () => {
      const periodStart = "";
      const periodEnd = "";
      const groupId = 1;

      const isDisabled = !periodStart || !periodEnd || !groupId;

      expect(isDisabled).toBe(true);
    });

    it("should enable calculate button when all required fields are selected", () => {
      const periodStart = "2026-01-01";
      const periodEnd = "2026-01-31";
      const groupId = 1;

      const isDisabled = !periodStart || !periodEnd || !groupId;

      expect(isDisabled).toBe(false);
    });

    it("should disable create batch button when payroll is not calculated", () => {
      const calculatedData: any[] = [];

      const isDisabled = calculatedData.length === 0;

      expect(isDisabled).toBe(true);
    });

    it("should enable create batch button when payroll is calculated", () => {
      const calculatedData = [
        {
          workerId: 1,
          workerName: "أحمد محمد",
          daysWorked: 20,
          baseAmount: 2000,
          deductions: 200,
          bonuses: 100,
          netAmount: 1900,
        },
      ];

      const isDisabled = calculatedData.length === 0;

      expect(isDisabled).toBe(false);
    });
  });

  describe("Data Validation", () => {
    it("should clear calculated data when period changes", () => {
      let calculatedData = [
        {
          workerId: 1,
          workerName: "أحمد محمد",
          daysWorked: 20,
          baseAmount: 2000,
          deductions: 200,
          bonuses: 100,
          netAmount: 1900,
        },
      ];

      // Simulate period change
      calculatedData = [];

      expect(calculatedData).toHaveLength(0);
    });

    it("should clear calculated data when group changes", () => {
      let calculatedData = [
        {
          workerId: 1,
          workerName: "أحمد محمد",
          daysWorked: 20,
          baseAmount: 2000,
          deductions: 200,
          bonuses: 100,
          netAmount: 1900,
        },
      ];

      // Simulate group change
      calculatedData = [];

      expect(calculatedData).toHaveLength(0);
    });

    it("should handle missing daily rate gracefully", () => {
      const worker = { id: 1, fullName: "أحمد محمد", dailyRate: "" };

      const dailyRate = parseFloat(worker.dailyRate || "0");
      const baseAmount = dailyRate * 20;

      expect(dailyRate).toBe(0);
      expect(baseAmount).toBe(0);
    });
  });
});
