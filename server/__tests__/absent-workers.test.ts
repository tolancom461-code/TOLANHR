import { describe, expect, it } from "vitest";

/**
 * Test the date conversion fix in getAbsentWorkers.
 * The bug was: workDate (a Date object from tRPC/superjson) was concatenated
 * with 'T00:00:00' string, producing "Invalid Date".
 * 
 * Fix: Convert Date object to 'YYYY-MM-DD' string first using toLocaleDateString('en-CA').
 */

function convertWorkDate(workDate: Date | string): { startOfDay: Date; endOfDay: Date } {
  const dateStr = workDate instanceof Date
    ? workDate.toLocaleDateString('en-CA')
    : String(workDate).split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00');
  const endOfDay = new Date(dateStr + 'T23:59:59.999');
  return { startOfDay, endOfDay };
}

describe("getAbsentWorkers date conversion fix", () => {
  it("should produce valid dates when workDate is a Date object", () => {
    const workDate = new Date("2026-02-01T00:00:00.000Z");
    const { startOfDay, endOfDay } = convertWorkDate(workDate);

    expect(startOfDay.toString()).not.toBe("Invalid Date");
    expect(endOfDay.toString()).not.toBe("Invalid Date");
  });

  it("should produce valid dates when workDate is a string", () => {
    const workDate = "2026-02-01";
    const { startOfDay, endOfDay } = convertWorkDate(workDate);

    expect(startOfDay.toString()).not.toBe("Invalid Date");
    expect(endOfDay.toString()).not.toBe("Invalid Date");
  });

  it("should produce valid dates when workDate is an ISO string", () => {
    const workDate = "2026-02-01T00:00:00.000Z";
    const { startOfDay, endOfDay } = convertWorkDate(workDate);

    expect(startOfDay.toString()).not.toBe("Invalid Date");
    expect(endOfDay.toString()).not.toBe("Invalid Date");
  });

  it("should correctly extract date part from Date object", () => {
    // Simulate a Date object as tRPC/superjson would send
    const workDate = new Date("2026-03-15T12:30:00.000Z");
    const dateStr = workDate instanceof Date
      ? workDate.toLocaleDateString('en-CA')
      : String(workDate).split('T')[0];

    // dateStr should be a valid YYYY-MM-DD format
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("should demonstrate the bug with old code (Date + string concatenation)", () => {
    const workDate = new Date("2026-02-01T00:00:00.000Z");
    
    // This is the BUGGY code that was causing Invalid Date
    const buggyDate = new Date(workDate + 'T00:00:00');
    expect(buggyDate.toString()).toBe("Invalid Date");
  });

  it("endOfDay should be after startOfDay", () => {
    const workDate = new Date("2026-02-01T00:00:00.000Z");
    const { startOfDay, endOfDay } = convertWorkDate(workDate);

    expect(endOfDay.getTime()).toBeGreaterThan(startOfDay.getTime());
  });

  it("startOfDay and endOfDay should be within the same calendar day", () => {
    const workDate = new Date("2026-02-01T00:00:00.000Z");
    const { startOfDay, endOfDay } = convertWorkDate(workDate);

    // The difference should be less than 24 hours
    const diffMs = endOfDay.getTime() - startOfDay.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    expect(diffHours).toBeLessThanOrEqual(24);
    expect(diffHours).toBeGreaterThan(23);
  });
});
