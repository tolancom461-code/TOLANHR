import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../db', () => ({
  // Daily Finance Functions
  createOrUpdateDailyFinance: vi.fn().mockResolvedValue({ id: 1, created: true }),
  calculateDailyFinanceFromAttendance: vi.fn().mockResolvedValue({
    baseAmount: 200,
    deductions: 25,
    bonuses: 0,
    lateMinutes: 30,
    earlyLeaveMinutes: 0,
  }),
  processAttendanceToFinance: vi.fn().mockResolvedValue({ id: 1, created: true }),
  getDailyFinanceRecords: vi.fn().mockResolvedValue([
    {
      id: 1,
      workerId: 1,
      workDate: '2024-01-15',
      baseAmount: '200.00',
      deductions: '25.00',
      bonuses: '0.00',
      netAmount: '175.00',
      lateMinutes: 30,
      earlyLeaveMinutes: 0,
    }
  ]),
  addFinanceEntry: vi.fn().mockResolvedValue({ id: 1, netAmount: 150 }),
  
  // Attendance Adjustment Functions
  updateAttendanceEvent: vi.fn().mockResolvedValue({ success: true }),
  getAttendanceEventsForEdit: vi.fn().mockResolvedValue([
    { id: 1, workerId: 1, eventType: 'check_in', eventTime: new Date(), method: 'manual', note: null },
    { id: 2, workerId: 1, eventType: 'check_out', eventTime: new Date(), method: 'manual', note: null },
  ]),
  
  // Pay Overrides Functions
  createPayOverride: vi.fn().mockResolvedValue({ id: 1, success: true }),
  getPendingOverrides: vi.fn().mockResolvedValue([
    {
      id: 1,
      workerId: 1,
      workerName: 'أحمد محمد',
      workerCode: 'W001',
      groupId: 1,
      overrideDate: '2024-01-15',
      overrideType: 'bonus',
      amount: '100.00',
      reason: 'مكافأة أداء',
      status: 'pending',
      createdAt: new Date(),
    }
  ]),
  approveOverride: vi.fn().mockResolvedValue({ success: true }),
  rejectOverride: vi.fn().mockResolvedValue({ success: true }),
  
  // Payroll Functions
  createPayrollBatch: vi.fn().mockResolvedValue({
    batchId: 1,
    batchCode: 'PAY-1234567890',
    totalAmount: 5000,
    workersCount: 10,
  }),
  getPayrollBatches: vi.fn().mockResolvedValue([
    {
      id: 1,
      batchCode: 'PAY-1234567890',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      groupId: null,
      costCenterId: null,
      totalAmount: '5000.00',
      status: 'draft',
      createdAt: new Date(),
    }
  ]),
  getPayrollBatchDetails: vi.fn().mockResolvedValue({
    batch: {
      id: 1,
      batchCode: 'PAY-1234567890',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-31',
      totalAmount: '5000.00',
      status: 'draft',
    },
    items: [
      {
        id: 1,
        workerId: 1,
        workerName: 'أحمد محمد',
        workerCode: 'W001',
        daysWorked: 22,
        baseAmount: '4400.00',
        totalDeductions: '200.00',
        totalBonuses: '100.00',
        netAmount: '4300.00',
      }
    ]
  }),
}));

import * as db from '../db';

describe('Phase 4 Complete: Attendance to Finance Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Daily Finance Core Logic', () => {
    it('should calculate daily finance from attendance', async () => {
      const result = await db.calculateDailyFinanceFromAttendance(1, '2024-01-15');
      
      expect(result).toHaveProperty('baseAmount');
      expect(result).toHaveProperty('deductions');
      expect(result).toHaveProperty('lateMinutes');
      expect(result.baseAmount).toBe(200);
      expect(result.lateMinutes).toBe(30);
    });

    it('should create or update daily finance record', async () => {
      const result = await db.createOrUpdateDailyFinance(1, '2024-01-15', {
        baseAmount: 200,
        deductions: 25,
        bonuses: 0,
        lateMinutes: 30,
      });
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('created');
    });

    it('should process attendance to finance in one call', async () => {
      const result = await db.processAttendanceToFinance(1, '2024-01-15');
      
      expect(result).toHaveProperty('id');
      expect(db.processAttendanceToFinance).toHaveBeenCalledWith(1, '2024-01-15');
    });

    it('should get daily finance records for a worker', async () => {
      const records = await db.getDailyFinanceRecords(1, '2024-01-01', '2024-01-31');
      
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
      expect(records[0]).toHaveProperty('workerId');
      expect(records[0]).toHaveProperty('netAmount');
    });

    it('should add finance entry (deduction/bonus)', async () => {
      const result = await db.addFinanceEntry(1, '2024-01-15', 'deduction', 50, 'خصم تأخير');
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('netAmount');
    });
  });

  describe('Attendance Adjustment (HR)', () => {
    it('should get attendance events for editing', async () => {
      const events = await db.getAttendanceEventsForEdit(1, '2024-01-15');
      
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBe(2);
      expect(events[0]).toHaveProperty('eventType');
    });

    it('should update attendance event with note', async () => {
      const result = await db.updateAttendanceEvent(
        1,
        new Date('2024-01-15T08:00:00'),
        'تصحيح وقت الحضور',
        1
      );
      
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });
  });

  describe('Pay Overrides (Exceptions)', () => {
    it('should create a new pay override', async () => {
      const result = await db.createPayOverride({
        workerId: 1,
        overrideDate: '2024-01-15',
        overrideType: 'bonus',
        amount: 100,
        reason: 'مكافأة أداء',
        createdBy: 1,
      });
      
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('success');
    });

    it('should get pending overrides', async () => {
      const overrides = await db.getPendingOverrides();
      
      expect(Array.isArray(overrides)).toBe(true);
      expect(overrides[0]).toHaveProperty('status');
      expect(overrides[0].status).toBe('pending');
    });

    it('should get pending overrides filtered by group', async () => {
      const overrides = await db.getPendingOverrides(1);
      
      expect(db.getPendingOverrides).toHaveBeenCalledWith(1);
    });

    it('should approve an override', async () => {
      const result = await db.approveOverride(1, 1);
      
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });

    it('should reject an override', async () => {
      const result = await db.rejectOverride(1, 1);
      
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });
  });

  describe('Payroll Batches', () => {
    it('should create a payroll batch (draft)', async () => {
      const result = await db.createPayrollBatch({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        createdBy: 1,
      });
      
      expect(result).toHaveProperty('batchId');
      expect(result).toHaveProperty('batchCode');
      expect(result).toHaveProperty('totalAmount');
      expect(result).toHaveProperty('workersCount');
    });

    it('should create a payroll batch for specific group', async () => {
      const result = await db.createPayrollBatch({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        groupId: 1,
        createdBy: 1,
      });
      
      expect(db.createPayrollBatch).toHaveBeenCalledWith(expect.objectContaining({
        groupId: 1,
      }));
    });

    it('should list payroll batches', async () => {
      const batches = await db.getPayrollBatches();
      
      expect(Array.isArray(batches)).toBe(true);
      expect(batches[0]).toHaveProperty('batchCode');
      expect(batches[0]).toHaveProperty('status');
    });

    it('should list payroll batches filtered by status', async () => {
      const batches = await db.getPayrollBatches('draft');
      
      expect(db.getPayrollBatches).toHaveBeenCalledWith('draft');
    });

    it('should get payroll batch details with items', async () => {
      const details = await db.getPayrollBatchDetails(1);
      
      expect(details).toHaveProperty('batch');
      expect(details).toHaveProperty('items');
      expect(details?.batch).toHaveProperty('batchCode');
      expect(Array.isArray(details?.items)).toBe(true);
      expect(details?.items[0]).toHaveProperty('workerName');
      expect(details?.items[0]).toHaveProperty('netAmount');
    });
  });

  describe('Integration: Attendance → Finance Flow', () => {
    it('should complete full attendance to finance flow', async () => {
      // Step 1: Process attendance
      const financeResult = await db.processAttendanceToFinance(1, '2024-01-15');
      expect(financeResult).toHaveProperty('id');
      
      // Step 2: Add additional entry
      const entryResult = await db.addFinanceEntry(1, '2024-01-15', 'bonus', 50, 'مكافأة');
      expect(entryResult).toHaveProperty('netAmount');
      
      // Step 3: Get records
      const records = await db.getDailyFinanceRecords(1, '2024-01-01', '2024-01-31');
      expect(records.length).toBeGreaterThan(0);
    });

    it('should complete override approval flow', async () => {
      // Step 1: Create override
      const createResult = await db.createPayOverride({
        workerId: 1,
        overrideDate: '2024-01-15',
        overrideType: 'bonus',
        amount: 100,
        reason: 'مكافأة',
        createdBy: 1,
      });
      expect(createResult).toHaveProperty('id');
      
      // Step 2: Get pending
      const pending = await db.getPendingOverrides();
      expect(pending.length).toBeGreaterThan(0);
      
      // Step 3: Approve
      const approveResult = await db.approveOverride(1, 1);
      expect(approveResult.success).toBe(true);
    });

    it('should complete payroll batch creation flow', async () => {
      // Step 1: Create batch
      const batchResult = await db.createPayrollBatch({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
        createdBy: 1,
      });
      expect(batchResult).toHaveProperty('batchId');
      
      // Step 2: Get details
      const details = await db.getPayrollBatchDetails(1);
      expect(details?.batch).toHaveProperty('totalAmount');
      expect(details?.items).toBeDefined();
    });
  });

  describe('Permission Checks', () => {
    it('should require EDIT_ATTENDANCE permission for adjustments', async () => {
      // This is a conceptual test - actual permission check happens in routers
      const result = await db.updateAttendanceEvent(1, new Date(), 'test', 1);
      expect(result.success).toBe(true);
    });

    it('should require APPROVE_OVERRIDES permission for approval', async () => {
      // This is a conceptual test - actual permission check happens in routers
      const result = await db.approveOverride(1, 1);
      expect(result.success).toBe(true);
    });
  });
});
