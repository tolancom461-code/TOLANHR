import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "../routers";
import * as db from "../db";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    username: "testadmin",
    email: "admin@example.com",
    fullName: "Test Admin",
    phone: null,
    loginMethod: "manus",
    role: "super_admin",
    roleId: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("payroll batch creation with operational flags check", () => {
  let realWorkerId: number;

  beforeAll(async () => {
    const workers = await db.getAllWorkers();
    realWorkerId = workers[0].id;
  });

  it("should block batch creation when pending operational flags exist", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const today = new Date().toLocaleDateString('en-CA');

    // First, create a pending operational flag
    await caller.operationalDashboard.createFlag({
      workerId: realWorkerId,
      flagDate: today,
      flagType: "confirm_attendance",
      description: "تأكيد حضور للاختبار",
    });

    // Verify there are pending flags
    const pendingCount = await caller.operationalDashboard.getPendingCount();
    expect(pendingCount).toBeGreaterThan(0);

    // Try to create a payroll batch - should fail
    await expect(
      caller.payroll.createBatch({
        periodStart: "2026-02-01",
        periodEnd: "2026-02-10",
        costCenterId: 1,
        items: [
          {
            workerId: realWorkerId,
            baseAmount: "1000",
            deductions: "0",
            bonuses: "0",
            netAmount: "1000",
          },
        ],
      })
    ).rejects.toThrow("ملاحظة تشغيلية معلقة");
  });

  it("should allow batch creation after all flags are processed", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Get all pending flags and approve them
    const pendingFlags = await caller.operationalDashboard.getFlags({
      status: "pending",
    });

    for (const flag of pendingFlags) {
      await caller.operationalDashboard.approveFlag({
        flagId: flag.id,
        notes: "تمت الموافقة للاختبار",
      });
    }

    // Verify no pending flags
    const pendingCount = await caller.operationalDashboard.getPendingCount();
    expect(pendingCount).toBe(0);
  });

  it("getPendingCount returns 0 when no pending flags exist after processing", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Process all pending flags first
    const pendingFlags = await caller.operationalDashboard.getFlags({
      status: "pending",
    });

    for (const flag of pendingFlags) {
      await caller.operationalDashboard.approveFlag({
        flagId: flag.id,
        notes: "cleanup",
      });
    }

    const count = await caller.operationalDashboard.getPendingCount();
    expect(count).toBe(0);
  });
});
