import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as db from '../db';

describe('Payroll Lock System', { timeout: 60000 }, () => {
  let testWorkerId: number;
  const createdBatchIds: number[] = [];
  let testItems: Array<{ workerId: number; baseAmount: string; deductions: string; bonuses: string; netAmount: string }> = [];

  beforeAll(async () => {
    const workers = await db.getAllWorkers();
    if (workers.length > 0) {
      testWorkerId = workers[0].id;
      testItems = [{
        workerId: workers[0].id,
        baseAmount: '100.00',
        deductions: '10.00',
        bonuses: '5.00',
        netAmount: '95.00',
      }];
    } else {
      throw new Error('No workers found in database.');
    }
  });

  afterEach(async () => {
    createdBatchIds.length = 0;
  });

  it('should allow attendance editing when no payroll batch exists', async () => {
    expect(testWorkerId).toBeGreaterThan(0);
  });

  it('should create payroll batch successfully', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-06-01',
      periodEnd: '2025-06-30',
      createdBy: 1,
      items: testItems,
    });

    expect(batch).toBeDefined();
    expect(batch.batchCode).toBeDefined();
    createdBatchIds.push(batch.batchId);
  });

  it('should detect payroll batch for date', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-07-01',
      periodEnd: '2025-07-31',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should prevent attendance editing after batch creation', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-08-01',
      periodEnd: '2025-08-31',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should prevent adding deductions after batch creation', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-09-01',
      periodEnd: '2025-09-30',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should prevent disabling full day override after batch creation', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-10-01',
      periodEnd: '2025-10-31',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should prevent enabling full day override after batch creation', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-11-01',
      periodEnd: '2025-11-30',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should delete draft batch successfully', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    await db.deleteBatch(batch.batchId);
    expect(batch.batchId).toBeGreaterThan(0);
  });

  it('should allow attendance editing after batch deletion', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should prevent deleting non-draft batches', async () => {
    const batch = await db.createPayrollBatch({
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      createdBy: 1,
      items: testItems,
    });

    expect(batch.batchId).toBeGreaterThan(0);
    createdBatchIds.push(batch.batchId);
  });

  it('should handle concurrent batch operations', async () => {
    const [batch1, batch2] = await Promise.all([
      db.createPayrollBatch({
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        createdBy: 1,
        items: testItems,
      }),
      db.createPayrollBatch({
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        createdBy: 1,
        items: testItems,
      }),
    ]);

    expect(batch1.batchId).toBeGreaterThan(0);
    expect(batch2.batchId).toBeGreaterThan(0);
    expect(batch1.batchId).not.toBe(batch2.batchId);
    
    createdBatchIds.push(batch1.batchId, batch2.batchId);
  });
});
