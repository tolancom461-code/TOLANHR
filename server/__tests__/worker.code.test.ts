import { describe, it, expect } from 'vitest';
import * as db from '../db';

describe('Worker Code Lookup', () => {
  it('should find worker by existing code', async () => {
    // Get first worker from database to test with real data
    const allWorkers = await db.getAllWorkers();
    if (allWorkers.length === 0) {
      console.log('No workers in database, skipping test');
      return;
    }
    
    const firstWorker = allWorkers[0];
    const worker = await db.getWorkerByManualCode(firstWorker.code);
    
    expect(worker).toBeDefined();
    expect(worker).not.toBeNull();
    expect(worker?.code).toBe(firstWorker.code);
  });

  it('should return null for non-existent code', async () => {
    const worker = await db.getWorkerByManualCode('INVALID-999-NONEXISTENT');
    
    expect(worker).toBeNull();
  });

  it('should find workers by different codes', async () => {
    const allWorkers = await db.getAllWorkers();
    if (allWorkers.length < 2) {
      console.log('Not enough workers in database, skipping test');
      return;
    }
    
    // Test with second worker
    const secondWorker = allWorkers[1];
    const worker = await db.getWorkerByManualCode(secondWorker.code);
    
    expect(worker).toBeDefined();
    expect(worker).not.toBeNull();
    expect(worker?.code).toBe(secondWorker.code);
  });
});
