import { describe, it, expect, vi } from "vitest";

// Mock database helpers
vi.mock("../db", () => ({
  getWorkerAttendance: vi.fn().mockResolvedValue([
    { id: 1, workerId: 1, eventType: 'check_in', eventTime: new Date(), method: 'qr' },
    { id: 2, workerId: 1, eventType: 'check_out', eventTime: new Date(), method: 'qr' },
  ]),
  getWorkerFinanceSummary: vi.fn().mockResolvedValue({
    totalEarnings: 1500,
    totalDeductions: 100,
    totalBonuses: 200,
    netAmount: 1600,
    daysWorked: 10,
  }),
  getWorkerPayOverrides: vi.fn().mockResolvedValue([
    { id: 1, workerId: 1, overrideType: 'bonus', amount: '200', reason: 'عمل إضافي', status: 'approved' },
  ]),
}));

describe("Worker Details APIs", () => {
  describe("getWorkerAttendance", () => {
    it("should return attendance records for a worker", async () => {
      const { getWorkerAttendance } = await import("../db");
      const result = await getWorkerAttendance(1, 30);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('eventType');
      expect(result[0]).toHaveProperty('eventTime');
    });

    it("should return empty array for worker with no attendance", async () => {
      const { getWorkerAttendance } = await import("../db");
      vi.mocked(getWorkerAttendance).mockResolvedValueOnce([]);
      
      const result = await getWorkerAttendance(999, 30);
      expect(result).toEqual([]);
    });
  });

  describe("getWorkerFinanceSummary", () => {
    it("should return finance summary for a worker", async () => {
      const { getWorkerFinanceSummary } = await import("../db");
      const result = await getWorkerFinanceSummary(1);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('totalEarnings');
      expect(result).toHaveProperty('totalDeductions');
      expect(result).toHaveProperty('totalBonuses');
      expect(result).toHaveProperty('netAmount');
      expect(result).toHaveProperty('daysWorked');
      expect(result.totalEarnings).toBe(1500);
      expect(result.netAmount).toBe(1600);
    });

    it("should return zero values for worker with no finance records", async () => {
      const { getWorkerFinanceSummary } = await import("../db");
      vi.mocked(getWorkerFinanceSummary).mockResolvedValueOnce({
        totalEarnings: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        netAmount: 0,
        daysWorked: 0,
      });
      
      const result = await getWorkerFinanceSummary(999);
      expect(result.totalEarnings).toBe(0);
      expect(result.daysWorked).toBe(0);
    });
  });

  describe("getWorkerPayOverrides", () => {
    it("should return pay overrides for a worker", async () => {
      const { getWorkerPayOverrides } = await import("../db");
      const result = await getWorkerPayOverrides(1);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toHaveProperty('overrideType');
      expect(result[0]).toHaveProperty('amount');
      expect(result[0]).toHaveProperty('status');
    });

    it("should return empty array for worker with no overrides", async () => {
      const { getWorkerPayOverrides } = await import("../db");
      vi.mocked(getWorkerPayOverrides).mockResolvedValueOnce([]);
      
      const result = await getWorkerPayOverrides(999);
      expect(result).toEqual([]);
    });
  });
});
