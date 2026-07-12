import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../routers";
import { getDb, createLocalUser, hashPassword } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "../_core/context";
import { COOKIE_NAME } from "../../shared/const";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext(): { ctx: TrpcContext; setCookies: CookieCall[] } {
  const setCookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx, setCookies };
}

describe("Local Authentication System", () => {
  const testUsername = `test_user_${Date.now()}`;
  const testPassword = "TestPassword123!";
  let testUserId: number;

  beforeAll(async () => {
    // Create a test user for authentication tests
    const result = await createLocalUser({
      username: testUsername,
      password: testPassword,
      fullName: "Test User",
      role: "guard",
    });
    testUserId = result.userId;
  });

  it("should successfully login with correct credentials", async () => {
    const { ctx, setCookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.localLogin({
      username: testUsername,
      password: testPassword,
    });

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user?.username).toBe(testUsername);
    expect(result.user?.fullName).toBe("Test User");
    
    // Verify that a session cookie was set
    expect(setCookies.length).toBeGreaterThan(0);
    const sessionCookie = setCookies.find((c) => c.name === COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
  });

  it("should fail login with incorrect password", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.localLogin({
        username: testUsername,
        password: "WrongPassword123!",
      })
    ).rejects.toThrow("اسم المستخدم أو كلمة السر غير صحيحة");
  });

  it("should fail login with non-existent username", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.localLogin({
        username: "nonexistent_user_12345",
        password: testPassword,
      })
    ).rejects.toThrow("اسم المستخدم أو كلمة السر غير صحيحة");
  });

  it("should fail login with inactive user", async () => {
    // Create an inactive user
    const inactiveUsername = `inactive_user_${Date.now()}`;
    await createLocalUser({
      username: inactiveUsername,
      password: testPassword,
      fullName: "Inactive User",
      role: "guard",
    });

    // Deactivate the user
    const db = await getDb();
    if (db) {
      await db
        .update(users)
        .set({ isActive: false })
        .where(eq(users.username, inactiveUsername));
    }

    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.auth.localLogin({
        username: inactiveUsername,
        password: testPassword,
      })
    ).rejects.toThrow("هذا الحساب غير نشط");
  });

  it("should hash passwords correctly", async () => {
    const password = "SecurePassword123!";
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(20); // bcrypt hashes are typically 60 chars
  });

  it("should create admin user with correct role", async () => {
    const adminUsername = `admin_test_${Date.now()}`;
    const result = await createLocalUser({
      username: adminUsername,
      password: testPassword,
      fullName: "Admin Test User",
      role: "super_admin",
    });

    expect(result.userId).toBeGreaterThan(0);

    const db = await getDb();
    if (db) {
      const adminUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, result.userId))
        .limit(1);

      expect(adminUsers.length).toBe(1);
      const adminUser = adminUsers[0];
      expect(adminUser).toBeDefined();
      expect(adminUser?.role).toBe("super_admin");
      expect(adminUser?.username).toBe(adminUsername);
    }
  });

  it("should update lastSignedIn timestamp on successful login", async () => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Get initial lastSignedIn
    const usersBefore = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(usersBefore.length).toBe(1);
    const userBefore = usersBefore[0];
    const initialLastSignedIn = userBefore?.lastSignedIn;

    // Wait a moment to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Login
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await caller.auth.localLogin({
      username: testUsername,
      password: testPassword,
    });

    // Get updated lastSignedIn
    const usersAfter = await db
      .select()
      .from(users)
      .where(eq(users.id, testUserId))
      .limit(1);

    expect(usersAfter.length).toBe(1);
    const userAfter = usersAfter[0];
    expect(userAfter?.lastSignedIn).toBeDefined();
    if (initialLastSignedIn && userAfter?.lastSignedIn) {
      expect(userAfter.lastSignedIn.getTime()).toBeGreaterThan(
        initialLastSignedIn.getTime()
      );
    }
  });
});
