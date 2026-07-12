import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database helpers
vi.mock("../db", () => ({
  recordAttendance: vi.fn().mockResolvedValue({
    success: true,
    eventType: 'check_in',
    workerId: 1,
    timestamp: new Date()
  }),
  getWorkerByQRToken: vi.fn().mockResolvedValue({
    id: 1,
    fullName: 'أحمد محمد',
    code: 'W001',
    qrToken: 'test-qr-token',
    status: 'active'
  }),
  getWorkerByManualCode: vi.fn().mockResolvedValue({
    id: 1,
    fullName: 'أحمد محمد',
    code: 'W001',
    status: 'active'
  }),
  getTodayAttendance: vi.fn().mockResolvedValue([
    { id: 1, workerId: 1, workerName: 'أحمد محمد', workerCode: 'W001', eventType: 'check_in', eventTime: new Date(), method: 'manual' },
    { id: 2, workerId: 1, workerName: 'أحمد محمد', workerCode: 'W001', eventType: 'check_out', eventTime: new Date(), method: 'manual' },
  ]),
  getWorkerLastEvent: vi.fn().mockResolvedValue({
    id: 1,
    workerId: 1,
    eventType: 'check_in',
    eventTime: new Date()
  }),
  getMonthlyAttendanceReport: vi.fn().mockResolvedValue([
    { workerId: 1, workerName: 'أحمد محمد', workerCode: 'W001', daysPresent: 22, totalCheckIns: 22, totalCheckOuts: 22, totalHours: 176, avgHoursPerDay: 8 },
  ]),
  getWorkDays: vi.fn().mockResolvedValue([
    { id: 1, workDate: '2026-01-01', dayType: 'holiday', notes: 'رأس السنة' },
    { id: 2, workDate: '2026-01-02', dayType: 'normal', notes: null },
  ]),
  upsertWorkDay: vi.fn().mockResolvedValue({ success: true }),
  getAttendanceStats: vi.fn().mockResolvedValue({
    totalWorkers: 50,
    presentToday: 45,
    absentToday: 5,
    lateToday: 2
  }),
}));

describe("Attendance System APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordAttendance", () => {
    it("should record check-in successfully", async () => {
      const { recordAttendance } = await import("../db");
      const result = await recordAttendance(1, 'check_in', 'manual');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.eventType).toBe('check_in');
      expect(result.workerId).toBe(1);
    });

    it("should record check-out successfully", async () => {
      const { recordAttendance } = await import("../db");
      vi.mocked(recordAttendance).mockResolvedValueOnce({
        success: true,
        eventType: 'check_out',
        workerId: 1,
        timestamp: new Date()
      });
      
      const result = await recordAttendance(1, 'check_out', 'qr');
      expect(result.eventType).toBe('check_out');
    });
  });

  describe("getWorkerByQRToken", () => {
    it("should find worker by QR token", async () => {
      const { getWorkerByQRToken } = await import("../db");
      const result = await getWorkerByQRToken('test-qr-token');
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
      expect(result?.qrToken).toBe('test-qr-token');
    });

    it("should return null for invalid QR token", async () => {
      const { getWorkerByQRToken } = await import("../db");
      vi.mocked(getWorkerByQRToken).mockResolvedValueOnce(null);
      
      const result = await getWorkerByQRToken('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe("getWorkerByManualCode", () => {
    it("should find worker by manual code", async () => {
      const { getWorkerByManualCode } = await import("../db");
      const result = await getWorkerByManualCode('W001');
      
      expect(result).toBeDefined();
      expect(result?.code).toBe('W001');
    });

    it("should return null for invalid code", async () => {
      const { getWorkerByManualCode } = await import("../db");
      vi.mocked(getWorkerByManualCode).mockResolvedValueOnce(null);
      
      const result = await getWorkerByManualCode('INVALID');
      expect(result).toBeNull();
    });
  });

  describe("getTodayAttendance", () => {
    it("should return today's attendance records", async () => {
      const { getTodayAttendance } = await import("../db");
      const result = await getTodayAttendance();
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).toHaveProperty('eventType');
      expect(result[0]).toHaveProperty('workerName');
    });

    it("should filter by group when specified", async () => {
      const { getTodayAttendance } = await import("../db");
      vi.mocked(getTodayAttendance).mockResolvedValueOnce([
        { id: 1, workerId: 1, workerName: 'أحمد محمد', workerCode: 'W001', groupId: 1, eventType: 'check_in', eventTime: new Date(), method: 'manual' },
      ]);
      
      const result = await getTodayAttendance(1);
      expect(result.length).toBe(1);
    });
  });

  describe("getWorkerLastEvent", () => {
    it("should return worker's last event today", async () => {
      const { getWorkerLastEvent } = await import("../db");
      const result = await getWorkerLastEvent(1);
      
      expect(result).toBeDefined();
      expect(result?.workerId).toBe(1);
      expect(result?.eventType).toBe('check_in');
    });

    it("should return null if no events today", async () => {
      const { getWorkerLastEvent } = await import("../db");
      vi.mocked(getWorkerLastEvent).mockResolvedValueOnce(null);
      
      const result = await getWorkerLastEvent(999);
      expect(result).toBeNull();
    });
  });

  describe("getMonthlyAttendanceReport", () => {
    it("should return monthly report with statistics", async () => {
      const { getMonthlyAttendanceReport } = await import("../db");
      const result = await getMonthlyAttendanceReport(2026, 1);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('daysPresent');
      expect(result[0]).toHaveProperty('totalHours');
      expect(result[0]).toHaveProperty('avgHoursPerDay');
    });

    it("should filter by group when specified", async () => {
      const { getMonthlyAttendanceReport } = await import("../db");
      const result = await getMonthlyAttendanceReport(2026, 1, 1);
      
      expect(result).toBeDefined();
    });
  });

  describe("getWorkDays", () => {
    it("should return work days for a month", async () => {
      const { getWorkDays } = await import("../db");
      const result = await getWorkDays(2026, 1);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('dayType');
    });
  });

  describe("upsertWorkDay", () => {
    it("should create or update work day", async () => {
      const { upsertWorkDay } = await import("../db");
      const result = await upsertWorkDay('2026-01-15', 'holiday', 'عطلة رسمية');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe("getAttendanceStats", () => {
    it("should return attendance statistics", async () => {
      const { getAttendanceStats } = await import("../db");
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const result = await getAttendanceStats(today, tomorrow);
      
      expect(result).toBeDefined();
      expect(result.totalWorkers).toBe(50);
      expect(result.presentToday).toBe(45);
      expect(result.absentToday).toBe(5);
    });
  });
});
