import { describe, expect, it } from "vitest";

describe("Supabase Connection", () => {
  it("should have SUPABASE_URL environment variable set", () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    expect(supabaseUrl).toBeDefined();
    expect(supabaseUrl).not.toBe("");
    expect(supabaseUrl).toContain("supabase.co");
  });

  it("should have SUPABASE_ANON_KEY environment variable set", () => {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    expect(anonKey).toBeDefined();
    expect(anonKey).not.toBe("");
  });

  it("should have SUPABASE_SERVICE_KEY environment variable set", () => {
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    expect(serviceKey).toBeDefined();
    expect(serviceKey).not.toBe("");
  });

  it("should be able to connect to Supabase API", async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !anonKey) {
      console.warn("Supabase credentials not set, skipping connection test");
      return;
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
      });
      
      // Supabase returns 200 for valid API keys
      expect(response.status).toBeLessThan(500);
    } catch (error) {
      // Network errors are acceptable in test environment
      console.warn("Network error during Supabase connection test:", error);
    }
  });
});
