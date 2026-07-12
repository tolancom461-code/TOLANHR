import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-supervisor",
    email: "supervisor@example.com",
    name: "Test Supervisor",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("operationalDashboard", () => {
  describe("getStats", () => {
    it("returns stats with present, absent, late counts for today", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getStats({
        workDateStr: today,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("presentCount");
      expect(result).toHaveProperty("absentCount");
      expect(result).toHaveProperty("lateCount");
      expect(typeof result.presentCount).toBe("number");
      expect(typeof result.absentCount).toBe("number");
      expect(typeof result.lateCount).toBe("number");
    });

    it("returns stats filtered by groupId", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getStats({
        workDateStr: today,
        groupId: 1,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("presentCount");
      expect(result).toHaveProperty("absentCount");
      expect(result).toHaveProperty("lateCount");
    });

    it("returns stats filtered by costCenterId", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getStats({
        workDateStr: today,
        costCenterId: 1,
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("presentCount");
    });
  });

  describe("getPresentWorkers", () => {
    it("returns an array of present workers", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getPresentWorkers({
        workDateStr: today,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getAbsentWorkers", () => {
    it("returns an array of absent workers", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getAbsentWorkers({
        workDateStr: today,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getLateWorkers", () => {
    it("returns an array of late workers", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.getLateWorkers({
        workDateStr: today,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("createFlag", () => {
    it("creates a confirm_attendance flag successfully", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.createFlag({
        workerId: 1,
        flagDate: today,
        flagType: "confirm_attendance",
        description: "تأكيد حضور العامل",
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(typeof result.flagId).toBe("number");
    });

    it("creates a confirm_absence flag successfully", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      const result = await caller.operationalDashboard.createFlag({
        workerId: 2,
        flagDate: today,
        flagType: "confirm_absence",
        description: "تأكيد غياب العامل",
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(typeof result.flagId).toBe("number");
    });

    it("rejects unauthenticated users", async () => {
      const { ctx } = createUnauthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      await expect(
        caller.operationalDashboard.createFlag({
          workerId: 1,
          flagDate: today,
          flagType: "confirm_attendance",
          description: "test",
        })
      ).rejects.toThrow();
    });
  });

  describe("getFlags", () => {
    it("returns flags for review", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.operationalDashboard.getFlags({
        status: "pending",
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("returns all flags when no filter", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.operationalDashboard.getFlags({});

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getPendingCount", () => {
    it("returns pending count as a number", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.operationalDashboard.getPendingCount();

      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe("approveFlag", () => {
    it("approves a flag successfully", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      // First create a flag
      const createResult = await caller.operationalDashboard.createFlag({
        workerId: 1,
        flagDate: today,
        flagType: "confirm_attendance",
        description: "test approval",
      });

      // Then approve it
      const approveResult = await caller.operationalDashboard.approveFlag({
        flagId: createResult.flagId,
        notes: "approved by test",
      });

      expect(approveResult).toBeDefined();
    });
  });

  describe("rejectFlag", () => {
    it("rejects a flag successfully", async () => {
      const { ctx } = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      const today = new Date().toLocaleDateString('en-CA');

      // First create a flag
      const createResult = await caller.operationalDashboard.createFlag({
        workerId: 2,
        flagDate: today,
        flagType: "confirm_absence",
        description: "test rejection",
      });

      // Then reject it
      const rejectResult = await caller.operationalDashboard.rejectFlag({
        flagId: createResult.flagId,
        notes: "rejected by test",
      });

      expect(rejectResult).toBeDefined();
    });
  });
});
