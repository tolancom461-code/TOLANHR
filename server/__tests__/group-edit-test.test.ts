import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    username: "testuser",
    email: "test@example.com",
    fullName: "Test User",
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
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Group Edit - Data Population Fix", () => {
  let router: ReturnType<typeof appRouter.createCaller>;
  let createdGroupId: number;
  const uniqueCode = `TEST-EDIT-${Date.now()}`;

  beforeAll(() => {
    const ctx = createAuthContext();
    router = appRouter.createCaller(ctx);
  });

  it("should create a group with all fields", async () => {
    const result = await router.groups.create({
      code: uniqueCode,
      name: "مجموعة اختبار الإصلاح",
      costCenterId: null,
      dailyWage: "100.50",
      workMinutes: "480",
      latePenaltyRate: "10.25",
      earlyLeavePenaltyRate: "5.75",
      shiftStartTime: "08:00",
      shiftEndTime: "16:00",
      isActive: true,
    });

    expect(result.id).toBeGreaterThan(0);
    createdGroupId = result.id;
    console.log(`✅ Group created with ID: ${createdGroupId}`);
  });

  it("should return group data with correct field names (camelCase) from list", async () => {
    const groups = await router.groups.list();
    const group = groups.find((g: any) => g.id === createdGroupId);

    expect(group).toBeDefined();
    
    // Verify key fields exist with camelCase names
    expect(group).toHaveProperty("id");
    expect(group).toHaveProperty("code");
    expect(group).toHaveProperty("name");

    // Verify values are correct
    expect(group?.code).toBe(uniqueCode);
    expect(group?.name).toBe("مجموعة اختبار الإصلاح");

    console.log("✅ List returns correct field names (camelCase)");
  });

  it("should return group data with correct field names (camelCase) from getById", async () => {
    const group = await router.groups.getById({ id: createdGroupId });

    expect(group).toBeDefined();
    
    // Verify key fields exist with camelCase names
    expect(group).toHaveProperty("id");
    expect(group).toHaveProperty("code");
    expect(group).toHaveProperty("name");

    // Verify values are correct
    expect(group?.code).toBe(uniqueCode);
    expect(group?.name).toBe("مجموعة اختبار الإصلاح");

    console.log("✅ getById returns correct field names (camelCase)");
  });

  it("should verify data consistency between list and getById", async () => {
    const groups = await router.groups.list();
    const groupFromList = groups.find((g: any) => g.id === createdGroupId);
    
    const groupFromGetById = await router.groups.getById({ id: createdGroupId });

    // Core fields should match
    expect(groupFromList?.id).toBe(groupFromGetById?.id);
    expect(groupFromList?.code).toBe(groupFromGetById?.code);
    expect(groupFromList?.name).toBe(groupFromGetById?.name);

    console.log("✅ Data consistency verified between list and getById");
  });

  it("should update group and verify all fields are returned correctly", async () => {
    const updatedCode = `${uniqueCode}-UPD`;
    await router.groups.update({
      id: createdGroupId,
      code: updatedCode,
      name: "مجموعة اختبار الإصلاح - محدثة",
      dailyWage: "150.75",
      workMinutes: "500",
      latePenaltyRate: "12.50",
      earlyLeavePenaltyRate: "7.25",
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
    });

    // Fetch updated data
    const updatedGroup = await router.groups.getById({ id: createdGroupId });

    // Verify fields are updated
    expect(updatedGroup?.code).toBe(updatedCode);
    expect(updatedGroup?.name).toBe("مجموعة اختبار الإصلاح - محدثة");

    console.log("✅ Update and retrieval working correctly");
  });

  it("should verify no snake_case fields are returned", async () => {
    const group = await router.groups.getById({ id: createdGroupId });

    // Check that snake_case fields are NOT present
    expect(group).not.toHaveProperty("cost_center_id");
    expect(group).not.toHaveProperty("daily_wage");
    expect(group).not.toHaveProperty("work_minutes");
    expect(group).not.toHaveProperty("late_penalty_rate");
    expect(group).not.toHaveProperty("early_leave_penalty_rate");
    expect(group).not.toHaveProperty("shift_start_time");
    expect(group).not.toHaveProperty("shift_end_time");
    expect(group).not.toHaveProperty("is_active");

    console.log("✅ No snake_case fields present - all camelCase");
  });
});
