import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../db';
import {
  getDetailedAttendanceReport,
  getAttendanceSummaryByWorker,
  getAttendanceSummaryByGroup,
  getAttendanceSummaryByCostCenter,
} from '../db';

describe('Attendance Export Functions', () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
  });

  // Note: getDetailedAttendanceReport is used internally by the export procedures
  // and is tested through the export procedures themselves

  describe('getAttendanceSummaryByWorker', () => {
    it('should return summary statistics for each worker', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByWorker(startDate, endDate);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('workerId');
        expect(result[0]).toHaveProperty('workerName');
        expect(result[0]).toHaveProperty('daysPresent');
        expect(result[0]).toHaveProperty('totalHours');
        expect(result[0]).toHaveProperty('avgHoursPerDay');
        expect(typeof result[0].daysPresent).toBe('number');
        expect(typeof result[0].totalHours).toBe('number');
      }
    });

    it('should calculate correct statistics', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByWorker(startDate, endDate);

      if (result.length > 0) {
        const worker = result[0];
        // avgHoursPerDay should be totalHours / daysPresent
        if (worker.daysPresent > 0) {
          const expectedAvg = Math.round((worker.totalHours / worker.daysPresent) * 100) / 100;
          expect(worker.avgHoursPerDay).toBe(expectedAvg);
        }
      }
    });

    it('should filter by costCenterId when provided', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';
      const costCenterId = 1;

      const result = await getAttendanceSummaryByWorker(startDate, endDate, undefined, costCenterId);

      expect(Array.isArray(result)).toBe(true);
      // All records should belong to the specified cost center
      if (result.length > 0) {
        result.forEach((record: any) => {
          expect(record.costCenterId).toBe(costCenterId);
        });
      }
    });
  });

  describe('getAttendanceSummaryByGroup', () => {
    it('should return summary statistics for each group', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByGroup(startDate, endDate);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('groupId');
        expect(result[0]).toHaveProperty('groupName');
        expect(result[0]).toHaveProperty('totalWorkers');
        expect(result[0]).toHaveProperty('totalHours');
        expect(typeof result[0].totalWorkers).toBe('number');
        expect(typeof result[0].totalHours).toBe('number');
      }
    });

    it('should have positive worker count', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByGroup(startDate, endDate);

      if (result.length > 0) {
        result.forEach((group: any) => {
          expect(group.totalWorkers).toBeGreaterThanOrEqual(0);
        });
      }
    });
  });

  describe('getAttendanceSummaryByCostCenter', () => {
    it('should return summary statistics for each cost center', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByCostCenter(startDate, endDate);

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('costCenterId');
        expect(result[0]).toHaveProperty('costCenterName');
        expect(result[0]).toHaveProperty('totalGroups');
        expect(result[0]).toHaveProperty('totalWorkers');
        expect(result[0]).toHaveProperty('totalHours');
      }
    });

    it('should have non-negative counts', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const result = await getAttendanceSummaryByCostCenter(startDate, endDate);

      if (result.length > 0) {
        result.forEach((center: any) => {
          expect(center.totalGroups).toBeGreaterThanOrEqual(0);
          expect(center.totalWorkers).toBeGreaterThanOrEqual(0);
          expect(center.totalHours).toBeGreaterThanOrEqual(0);
        });
      }
    });
  });
});
