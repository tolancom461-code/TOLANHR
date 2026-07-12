import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database module
vi.mock("../db", () => ({
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  createLocalUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  getAllRoles: vi.fn(),
  getRoleById: vi.fn(),
  getAllPermissions: vi.fn(),
  getUserPermissions: vi.fn(),
  getUserRolePermissions: vi.fn(),
  setUserPermissions: vi.fn(),
  getDashboardStats: vi.fn(),
  assignRoleToUser: vi.fn(),
}));

import * as db from "../db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: string = "super_admin"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-open-id",
    username: "testuser",
    email: "test@example.com",
    fullName: "Test User",
    phone: null,
    loginMethod: "manus",
    role: role,
    roleId: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
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

describe("users router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("users.list", () => {
    it("returns list of users", async () => {
      const mockUsers = [
        { id: 1, username: "user1", fullName: "User One", email: "user1@test.com", roleId: 1, isActive: true },
        { id: 2, username: "user2", fullName: "User Two", email: "user2@test.com", roleId: 2, isActive: true },
      ];
      
      vi.mocked(db.getAllUsers).mockResolvedValue(mockUsers as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.users.list();

      expect(result).toEqual(mockUsers);
      expect(db.getAllUsers).toHaveBeenCalledOnce();
    });
  });

  describe("users.getById", () => {
    it("returns user by id", async () => {
      const mockUser = { id: 1, username: "user1", fullName: "User One", email: "user1@test.com" };
      
      vi.mocked(db.getUserById).mockResolvedValue(mockUser as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.users.getById({ id: 1 });

      expect(result).toEqual(mockUser);
      expect(db.getUserById).toHaveBeenCalledWith(1);
    });
  });

  describe("users.create", () => {
    it("creates user successfully with super_admin role", async () => {
      vi.mocked((db as any).createLocalUser).mockResolvedValue(5);

      const ctx = createAuthContext("super_admin");
      const caller = appRouter.createCaller(ctx);

      const result = await caller.users.create({
        username: "newuser",
        fullName: "New User",
        email: "new@test.com",
        password: "TestPassword123!",
        isActive: true,
      });

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });

    it("throws FORBIDDEN if non-admin tries to create user", async () => {
      const ctx = createAuthContext("guard");
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.users.create({
          username: "newuser",
          fullName: "New User",
          email: "new@test.com",
          password: "TestPassword123!",
          isActive: true,
        })
      ).rejects.toThrow("ليس لديك صلاحية إنشاء مستخدمين");
    });
  });

  describe("users.update", () => {
    it("updates user successfully", async () => {
      vi.mocked(db.updateUser).mockResolvedValue(undefined);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.users.update({
        id: 1,
        fullName: "Updated Name",
        email: "updated@test.com",
      });

      expect(result).toEqual({ success: true });
      expect(db.updateUser).toHaveBeenCalledWith(1, {
        fullName: "Updated Name",
        email: "updated@test.com",
      });
    });
  });

  describe("users.delete", () => {
    it("deletes another user successfully", async () => {
      vi.mocked(db.deleteUser).mockResolvedValue(undefined);

      const ctx = createAuthContext(); // user id = 1
      const caller = appRouter.createCaller(ctx);

      // Delete user 2 (not self)
      const result = await caller.users.delete({ id: 2 });

      expect(result).toEqual({ success: true });
      expect(db.deleteUser).toHaveBeenCalledWith(2);
    });

    it("prevents deleting own account", async () => {
      vi.mocked(db.deleteUser).mockResolvedValue(undefined);

      const ctx = createAuthContext(); // user id = 1
      const caller = appRouter.createCaller(ctx);

      // Try to delete self (id = 1)
      await expect(caller.users.delete({ id: 1 })).rejects.toThrow(
        'لا يمكنك حذف حسابك الخاص'
      );
    });
  });
});

// Roles router tests are skipped because roles procedures were removed
describe.skip("roles router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("roles.list", () => {
    it("returns list of roles", async () => {
      const mockRoles = [
        { id: 1, name: "super_admin", level: 1 },
        { id: 2, name: "admin", level: 2 },
      ];
      
      vi.mocked(db.getAllRoles).mockResolvedValue(mockRoles as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.roles.list();

      expect(result).toEqual(mockRoles);
      expect(db.getAllRoles).toHaveBeenCalledOnce();
    });
  });
});

// Permissions router tests are skipped because permissions procedures were removed
describe.skip("permissions router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("permissions.list", () => {
    it("returns list of permissions", async () => {
      const mockPermissions = [
        { id: 1, code: "users.view", name: "View Users", category: "users" },
        { id: 2, code: "users.create", name: "Create Users", category: "users" },
      ];
      
      vi.mocked(db.getAllPermissions).mockResolvedValue(mockPermissions as any);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.permissions.list();

      expect(result).toEqual(mockPermissions);
      expect(db.getAllPermissions).toHaveBeenCalledOnce();
    });
  });
});

describe("dashboard router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("dashboard.stats", () => {
    it("returns dashboard statistics", async () => {
      const mockStats = {
        users: 10,
        groups: 3,
        workers: 50,
        costCenters: 2,
      };
      
      vi.mocked(db.getDashboardStats).mockResolvedValue(mockStats);

      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.dashboard.stats();

      expect(result).toEqual(mockStats);
      expect(db.getDashboardStats).toHaveBeenCalledOnce();
    });
  });
});
