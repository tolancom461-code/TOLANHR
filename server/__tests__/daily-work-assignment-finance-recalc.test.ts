import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => {
  const state = { selectQueue: [] as any[][], lockEvents: [] as string[] };

  const processAttendanceToFinance = vi.fn().mockResolvedValue({ id: 1, created: false });
  const assertOperationalAssignmentChangeAllowed = vi.fn().mockResolvedValue({ isReopened: false });
  const assertOperationalCostCenterAccess = vi.fn().mockResolvedValue(undefined);
  const recordOperationalAssignmentChange = vi.fn().mockResolvedValue(undefined);
  const logAudit = vi.fn().mockResolvedValue(undefined);
  const lockOperationalDayRows = vi.fn(async () => { state.lockEvents.push('day'); });

  const makeSelectQuery = () => {
    const query: any = {};
    query.from = vi.fn(() => query);
    query.leftJoin = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.for = vi.fn(() => { state.lockEvents.push('row'); return query; });
    query.then = (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(resolve, reject);
    return query;
  };

  const db: any = {
    select: vi.fn(() => makeSelectQuery()),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => ({ affectedRows: 1 })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => ({ insertId: 1 })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => ({ affectedRows: 1 })),
    })),
    transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(db)),
  };

  return {
    state,
    db,
    processAttendanceToFinance,
    assertOperationalAssignmentChangeAllowed,
    assertOperationalCostCenterAccess,
    recordOperationalAssignmentChange,
    logAudit,
    lockOperationalDayRows,
  };
});

vi.mock('../db/connection', () => ({
  getDb: vi.fn(async () => mocked.db),
}));

vi.mock('../db/daily-finance', () => ({
  processAttendanceToFinance: mocked.processAttendanceToFinance,
}));

vi.mock('../db/operational-days', () => ({
  assertOperationalAssignmentChangeAllowed: mocked.assertOperationalAssignmentChangeAllowed,
  assertOperationalCostCenterAccess: mocked.assertOperationalCostCenterAccess,
  recordOperationalAssignmentChange: mocked.recordOperationalAssignmentChange,
  lockOperationalDayRows: mocked.lockOperationalDayRows,
}));

vi.mock('../db/audit', () => ({
  logAudit: mocked.logAudit,
}));

import { removeDailyWorkAssignment, upsertDailyWorkAssignment } from '../db/daily-work-assignments';

describe('daily work assignment finance recalculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.state.selectQueue = [];
    mocked.state.lockEvents = [];
    mocked.assertOperationalAssignmentChangeAllowed.mockResolvedValue({ isReopened: false });
  });

  it('recalculates daily finance when the operational group changes', async () => {
    mocked.state.selectQueue = [
      [{ id: 660001, costCenterId: 180001 }, { id: 660003, costCenterId: 180001 }], // groups to lock
      [{ id: 12203, groupId: 660001 }], // worker
      [], // no approved transfer request
      [{ workerId: 12203 }], // attendance exists
      [{ id: 9001, operationalGroupId: null }], // existing assignment before transfer
      [{ id: 60001, isActive: true, costCenterId: 180001 }], // site
      [{ id: 660003, isActive: true, costCenterId: 180001 }], // target group
    ];

    await upsertDailyWorkAssignment({
      workerId: 12203,
      restaurantId: 60001,
      sourceGroupId: 660001,
      operationalGroupId: 660003,
      workDate: '2026-09-19',
      assignedBy: 1,
      actorRole: 'restaurant_operations',
    });

    expect(mocked.processAttendanceToFinance).toHaveBeenCalledTimes(1);
    expect(mocked.processAttendanceToFinance).toHaveBeenCalledWith(12203, '2026-09-19');
    expect(mocked.state.lockEvents.slice(0, 2)).toEqual(['day', 'row']);
    expect(mocked.lockOperationalDayRows).toHaveBeenCalledWith('2026-09-19', [180001, 180001], mocked.db);
    expect(mocked.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE_OPERATIONAL_ASSIGNMENT',
      tableName: 'daily_work_assignments',
      userId: 1,
    }));
  });

  it('does not recalculate finance for a site-only change when the operational group is unchanged', async () => {
    mocked.state.selectQueue = [
      [{ id: 660001, costCenterId: 180001 }], // groups to lock
      [{ id: 12203, groupId: 660001 }], // worker
      [], // no approved transfer request
      [{ workerId: 12203 }], // attendance exists
      [{ id: 9001, operationalGroupId: null }], // existing site-only assignment
      [{ id: 60001, isActive: true, costCenterId: 180001 }], // site
    ];

    await upsertDailyWorkAssignment({
      workerId: 12203,
      restaurantId: 60001,
      sourceGroupId: 660001,
      operationalGroupId: null,
      workDate: '2026-09-19',
      assignedBy: 1,
      actorRole: 'restaurant_operations',
    });

    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
    expect(mocked.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE_OPERATIONAL_ASSIGNMENT',
      tableName: 'daily_work_assignments',
    }));
  });

  it('recalculates daily finance when an operational transfer is removed via assignment save', async () => {
    mocked.state.selectQueue = [
      [{ id: 660001, costCenterId: 180001 }], // groups to lock
      [{ id: 12203, groupId: 660001 }], // worker
      [], // no approved transfer request
      [{ workerId: 12203 }], // attendance exists
      [{ id: 9001, operationalGroupId: 660003 }], // existing transferred assignment
    ];

    await upsertDailyWorkAssignment({
      workerId: 12203,
      restaurantId: null,
      sourceGroupId: 660001,
      operationalGroupId: null,
      workDate: '2026-09-19',
      assignedBy: 1,
      actorRole: 'restaurant_operations',
    });

    expect(mocked.processAttendanceToFinance).toHaveBeenCalledTimes(1);
    expect(mocked.processAttendanceToFinance).toHaveBeenCalledWith(12203, '2026-09-19');
    expect(mocked.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE_OPERATIONAL_ASSIGNMENT',
      tableName: 'daily_work_assignments',
      recordId: 9001,
    }));
  });

  it('recalculates daily finance when an operational transfer is removed via direct remove', async () => {
    mocked.state.selectQueue = [
      [{ costCenterId: 180001, groupId: 660001 }], // worker base group scope
      [{ groupId: 660001 }], // current worker row after locking center day
      [], // no approved transfer request
      [{ id: 9001, restaurantId: 60001, sourceGroupId: 660001, operationalGroupId: 660003 }], // existing transferred assignment
    ];

    await removeDailyWorkAssignment(
      12203,
      '2026-09-19',
      1,
      'restaurant_operations'
    );

    expect(mocked.processAttendanceToFinance).toHaveBeenCalledTimes(1);
    expect(mocked.processAttendanceToFinance).toHaveBeenCalledWith(12203, '2026-09-19');
    expect(mocked.state.lockEvents.slice(0, 2)).toEqual(['day', 'row']);
    expect(mocked.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE_OPERATIONAL_ASSIGNMENT',
      tableName: 'daily_work_assignments',
      recordId: 9001,
      userId: 1,
    }));
  });

  it('prevents direct assignment saves from bypassing an approved transfer request', async () => {
    mocked.state.selectQueue = [
      [{ id: 660001, costCenterId: 180001 }],
      [{ id: 12203, groupId: 660001 }],
      [{ id: 71 }],
    ];

    await expect(upsertDailyWorkAssignment({
      workerId: 12203,
      restaurantId: 60001,
      sourceGroupId: 660001,
      operationalGroupId: null,
      workDate: '2026-09-19',
      assignedBy: 1,
      actorRole: 'restaurant_operations',
    })).rejects.toThrow('أكمل إجراءاته من تبويب النقل');

    expect(mocked.db.update).not.toHaveBeenCalled();
    expect(mocked.db.insert).not.toHaveBeenCalled();
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });

  it('prevents direct assignment removal from bypassing an approved transfer request', async () => {
    mocked.state.selectQueue = [
      [{ costCenterId: 180001, groupId: 660001 }],
      [{ groupId: 660001 }],
      [{ id: 71 }],
    ];

    await expect(removeDailyWorkAssignment(12203, '2026-09-19', 1, 'restaurant_operations'))
      .rejects.toThrow('أكمل إجراءاته من تبويب النقل');

    expect(mocked.db.delete).not.toHaveBeenCalled();
    expect(mocked.processAttendanceToFinance).not.toHaveBeenCalled();
  });
});
