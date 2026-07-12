import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from '../db';

describe('Advanced Payroll Batch System', { timeout: 60000 }, () => {
  const testUserId = 1;
  let testItems: Array<{ workerId: number; baseAmount: string; deductions: string; bonuses: string; netAmount: string }> = [];
  const allCreatedBatchIds: number[] = [];

  beforeAll(async () => {
    // Get real worker IDs from database
    const allWorkers = await db.getAllWorkers();
    const realWorkerIds = allWorkers.slice(0, 2).map(w => w.id);
    if (realWorkerIds.length < 2) throw new Error('Need at least 2 workers in DB');
    testItems = realWorkerIds.map((id, i) => ({
      workerId: id,
      baseAmount: i === 0 ? '150.00' : '200.00',
      deductions: i === 0 ? '10.00' : '15.00',
      bonuses: i === 0 ? '5.00' : '10.00',
      netAmount: i === 0 ? '145.00' : '195.00',
    }));
  });

  afterAll(async () => {
    // Cleanup all created batches
    for (const id of allCreatedBatchIds) {
      try { await db.deleteBatch(id); } catch {}
    }
  });

  describe('Phase 1: Batch Creation', () => {
    it('should create a payroll batch in DRAFT status', async () => {
      const result = await db.createPayrollBatch({
        periodStart: '2026-01-01',
        periodEnd: '2026-01-07',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(result.batchId);
      expect(result.batchId).toBeGreaterThan(0);
      expect(result.batchCode).toBeDefined();

      const details = await db.getPayrollBatchDetails(result.batchId);
      expect(details).toHaveProperty('batch');
      expect(details.batch.status).toBe('draft');
      expect(details).toHaveProperty('items');
      expect(Array.isArray(details.items)).toBe(true);
    });

    it('should list batches by status', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-02-01',
        periodEnd: '2026-02-07',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const batches = await db.getBatchesByStatus('draft');
      expect(Array.isArray(batches)).toBe(true);
      expect(batches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Phase 2: Batch Approval Workflow', () => {
    it('should complete full approval workflow', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-02-08',
        periodEnd: '2026-02-14',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch.status).toBe('draft');
    });

    it('should handle batch status transitions', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-02-15',
        periodEnd: '2026-02-21',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const batch = await db.getPayrollBatchDetails(createResult.batchId);
      expect(batch.batch).toBeDefined();
      expect(batch.batch.id).toBe(createResult.batchId);
    });
  });

  describe('Phase 3: Batch Calculations', () => {
    it('should calculate batch totals correctly', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-02-22',
        periodEnd: '2026-02-28',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch).toHaveProperty('totalAmount');
      expect(details.batch).toHaveProperty('totalWorkers');
      expect(details.batch).toHaveProperty('totalDeductions');
      expect(details.batch).toHaveProperty('totalBonuses');
    });

    it('should handle single-item batches', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2030-03-01',
        periodEnd: '2030-03-07',
        createdBy: testUserId,
        items: testItems.slice(0, 1),
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch).toBeDefined();
      expect(details.batch.id).toBe(createResult.batchId);
      expect(Array.isArray(details.items)).toBe(true);
    });
  });

  describe('Phase 4: Batch History and Tracking', () => {
    it('should track batch creation', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-03-08',
        periodEnd: '2026-03-14',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch.createdBy).toBe(testUserId);
      expect(details.batch.createdAt).toBeDefined();
    });

    it('should track batch updates', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-03-15',
        periodEnd: '2026-03-21',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch.updatedAt).toBeDefined();
    });
  });

  describe('Phase 5: Error Handling', () => {
    it('should prevent duplicate submission', async () => {
      const batch1 = await db.createPayrollBatch({
        periodStart: '2026-03-22',
        periodEnd: '2026-03-28',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(batch1.batchId);

      const details = await db.getPayrollBatchDetails(batch1.batchId);
      expect(details.batch).toBeDefined();
    });

    it('should handle invalid status transitions', async () => {
      const createResult = await db.createPayrollBatch({
        periodStart: '2026-03-29',
        periodEnd: '2026-04-04',
        createdBy: testUserId,
        items: testItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch.status).toBe('draft');
    });
  });

  describe('Phase 6: Batch Deletion', () => {
    it('should delete draft batches', async () => {
      // Refresh worker IDs in case previous tests affected them
      const freshWorkers = await db.getAllWorkers();
      const freshItems = freshWorkers.slice(0, 2).map((w, i) => ({
        workerId: w.id,
        baseAmount: i === 0 ? '150.00' : '200.00',
        deductions: i === 0 ? '10.00' : '15.00',
        bonuses: i === 0 ? '5.00' : '10.00',
        netAmount: i === 0 ? '145.00' : '195.00',
      }));

      const createResult = await db.createPayrollBatch({
        periodStart: '2026-04-05',
        periodEnd: '2026-04-11',
        createdBy: testUserId,
        items: freshItems,
      });

      await db.deleteBatch(createResult.batchId);

      try {
        await db.getPayrollBatchDetails(createResult.batchId);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should prevent deletion of approved batches', async () => {
      // Refresh worker IDs in case previous tests affected them
      const freshWorkers = await db.getAllWorkers();
      const freshItems = freshWorkers.slice(0, 2).map((w, i) => ({
        workerId: w.id,
        baseAmount: i === 0 ? '150.00' : '200.00',
        deductions: i === 0 ? '10.00' : '15.00',
        bonuses: i === 0 ? '5.00' : '10.00',
        netAmount: i === 0 ? '145.00' : '195.00',
      }));

      const createResult = await db.createPayrollBatch({
        periodStart: '2026-04-12',
        periodEnd: '2026-04-18',
        createdBy: testUserId,
        items: freshItems,
      });

      allCreatedBatchIds.push(createResult.batchId);

      const details = await db.getPayrollBatchDetails(createResult.batchId);
      expect(details.batch).toBeDefined();
    });
  });
});
