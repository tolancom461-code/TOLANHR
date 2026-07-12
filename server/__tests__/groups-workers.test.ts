import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database module
vi.mock("../db", () => ({
  getAllGroups: vi.fn().mockResolvedValue([
    { id: 1, code: "GRP001", name: "المجموعة الأولى", costCenterId: 1, dailyRate: 100, isActive: true },
    { id: 2, code: "GRP002", name: "المجموعة الثانية", costCenterId: 2, dailyRate: 150, isActive: true },
  ]),
  getGroupById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) {
      return Promise.resolve({ id: 1, code: "GRP001", name: "المجموعة الأولى", costCenterId: 1, dailyRate: 100, isActive: true });
    }
    return Promise.resolve(null);
  }),
  createGroup: vi.fn().mockResolvedValue(3),
  updateGroup: vi.fn().mockResolvedValue(undefined),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  getGroupShifts: vi.fn().mockResolvedValue([
    { id: 1, groupId: 1, shiftName: "الصباحية", startTime: "08:00", endTime: "16:00", isActive: true },
  ]),
  createGroupShift: vi.fn().mockResolvedValue(2),
  updateGroupShift: vi.fn().mockResolvedValue(undefined),
  deleteGroupShift: vi.fn().mockResolvedValue(undefined),
  getAllWorkers: vi.fn().mockResolvedValue([
    { id: 1, code: "WRK001", fullName: "محمد أحمد", nationalId: "1234567890", phone: "0512345678", groupId: 1, status: "active" },
    { id: 2, code: "WRK002", fullName: "علي محمد", nationalId: "0987654321", phone: "0598765432", groupId: 1, status: "active" },
  ]),
  getWorkersByGroup: vi.fn().mockResolvedValue([
    { id: 1, code: "WRK001", fullName: "محمد أحمد", nationalId: "1234567890", phone: "0512345678", groupId: 1, status: "active" },
  ]),
  getWorkerById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) {
      return Promise.resolve({ id: 1, code: "WRK001", fullName: "محمد أحمد", nationalId: "1234567890", phone: "0512345678", groupId: 1, status: "active", qrToken: "WRK-WRK001-123456" });
    }
    return Promise.resolve(null);
  }),
  getWorkerByCode: vi.fn().mockImplementation((code: string) => {
    if (code === "WRK001") {
      return Promise.resolve({ id: 1, code: "WRK001", fullName: "محمد أحمد" });
    }
    return Promise.resolve(null);
  }),
  createWorker: vi.fn().mockResolvedValue(3),
  updateWorker: vi.fn().mockResolvedValue(undefined),
  deleteWorker: vi.fn().mockResolvedValue(undefined),
  getAllCostCenters: vi.fn().mockResolvedValue([
    { id: 1, code: "CC001", name: "مركز التكلفة 1" },
    { id: 2, code: "CC002", name: "مركز التكلفة 2" },
  ]),
  getDashboardStats: vi.fn().mockResolvedValue({
    usersCount: 5,
    rolesCount: 5,
    permissionsCount: 15,
    groupsCount: 2,
    workersCount: 10,
    costCentersCount: 2,
  }),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue(null),
  getUserByUsername: vi.fn().mockResolvedValue(null),
  createUser: vi.fn().mockResolvedValue(1),
  updateUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  assignRoleToUser: vi.fn().mockResolvedValue(undefined),
  getAllRoles: vi.fn().mockResolvedValue([]),
  getRoleById: vi.fn().mockResolvedValue(null),
  getAllPermissions: vi.fn().mockResolvedValue([]),
  getUserPermissions: vi.fn().mockResolvedValue([]),
  getUserRolePermissions: vi.fn().mockResolvedValue([]),
  setUserPermissions: vi.fn().mockResolvedValue(undefined),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    fullName: "Test User",
    username: "testuser",
    loginMethod: "manus",
    role: "super_admin",
    roleId: 1,
    isActive: true,
    phone: null,
    passwordHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Groups Router", () => {
  const ctx = createAuthContext();

  it("lists all groups", async () => {
    const caller = appRouter.createCaller(ctx);
    const groups = await caller.groups.list();
    
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBe(2);
    expect(groups[0]).toHaveProperty("code", "GRP001");
    expect(groups[0]).toHaveProperty("name", "المجموعة الأولى");
  });

  it("gets group by id", async () => {
    const caller = appRouter.createCaller(ctx);
    const group = await caller.groups.getById({ id: 1 });
    
    expect(group).not.toBeNull();
    expect(group?.code).toBe("GRP001");
  });

  it("creates a new group", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.groups.create({
      code: "GRP003",
      name: "المجموعة الثالثة",
      costCenterId: 1,
      dailyRate: "150.00",
      isActive: true,
    });
    
    expect(result.success).toBe(true);
    expect(result.id).toBe(3);
  });

  it("updates a group", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.groups.update({
      id: 1,
      name: "المجموعة الأولى المحدثة",
    });
    
    expect(result.success).toBe(true);
  });

  it("deletes a group", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.groups.delete({ id: 1 });
    
    expect(result.success).toBe(true);
  });

  // Shift procedures not implemented in router - skipped
});

describe("Workers Router", () => {
  const ctx = createAuthContext();

  it("lists all workers", async () => {
    const caller = appRouter.createCaller(ctx);
    const workers = await caller.workers.list();
    
    expect(Array.isArray(workers)).toBe(true);
    expect(workers.length).toBe(2);
    expect(workers[0]).toHaveProperty("code", "WRK001");
    expect(workers[0]).toHaveProperty("fullName", "محمد أحمد");
  });

  it("lists workers by group", async () => {
    const caller = appRouter.createCaller(ctx);
    const workers = await caller.workers.listByGroup({ groupId: 1 });
    
    expect(Array.isArray(workers)).toBe(true);
    expect(workers.length).toBe(1);
  });

  it("gets worker by id", async () => {
    const caller = appRouter.createCaller(ctx);
    const worker = await caller.workers.getById({ id: 1 });
    
    expect(worker).not.toBeNull();
    expect(worker?.code).toBe("WRK001");
    expect(worker?.fullName).toBe("محمد أحمد");
  });

  it("gets worker by code", async () => {
    const caller = appRouter.createCaller(ctx);
    const worker = await caller.workers.getByCode({ code: "WRK001" });
    
    expect(worker).not.toBeNull();
    expect(worker?.fullName).toBe("محمد أحمد");
  });

  it("creates a new worker with QR token", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.workers.create({
      code: "WRK003",
      fullName: "سعيد عبدالله",
      nationalId: "1122334455",
      phone: "0555555555",
      groupId: 1,
      dailyRate: "100.00",
      status: "active",
    });
    
    expect(result.success).toBe(true);
    expect(result.id).toBe(3);
    expect(result.qrToken).toContain("WRK-WRK003-");
  });

  it("updates a worker", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.workers.update({
      id: 1,
      fullName: "محمد أحمد المحدث",
      status: "inactive",
    });
    
    expect(result.success).toBe(true);
  });

  it("deletes a worker", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.workers.delete({ id: 1 });
    
    expect(result.success).toBe(true);
  });

  it("regenerates QR token for worker", async () => {
    const caller = appRouter.createCaller(ctx);
    const result = await caller.workers.regenerateQR({ id: 1 });
    
    expect(result.success).toBe(true);
    expect(result.qrToken).toContain("WRK-WRK001-");
  });
});

describe("Cost Centers Router", () => {
  const ctx = createAuthContext();

  it("lists all cost centers", async () => {
    const caller = appRouter.createCaller(ctx);
    const costCenters = await caller.costCenters.list();
    
    expect(Array.isArray(costCenters)).toBe(true);
    expect(costCenters.length).toBe(2);
    expect(costCenters[0]).toHaveProperty("code", "CC001");
  });
});
