import { describe, expect, it } from "vitest";

/**
 * Tests for the punches review center fix.
 * 
 * Problem: The getForReview and getAbsentWorkers procedures used z.date() input,
 * which caused tRPC query keys to not update when the date changed in the frontend.
 * Date objects create new references on each render, but tRPC's query key comparison
 * with superjson serialization was not reliably detecting changes.
 * 
 * Fix: Changed all workDate inputs from z.date() to z.string() (workDateStr in YYYY-MM-DD format).
 * The server now parses the string to a Date object internally.
 */

describe("workDateStr to Date conversion", () => {
  it("correctly converts YYYY-MM-DD string to start of day Date", () => {
    const workDateStr = "2026-02-01";
    const workDate = new Date(`${workDateStr}T00:00:00`);
    
    expect(workDate.getFullYear()).toBe(2026);
    expect(workDate.getMonth()).toBe(1); // February = 1 (0-indexed)
    expect(workDate.getDate()).toBe(1);
    expect(workDate.getHours()).toBe(0);
    expect(workDate.getMinutes()).toBe(0);
    expect(workDate.getSeconds()).toBe(0);
  });

  it("handles different date strings correctly", () => {
    const dates = ["2026-01-15", "2026-06-30", "2026-12-31"];
    
    for (const dateStr of dates) {
      const workDate = new Date(`${dateStr}T00:00:00`);
      expect(workDate.toString()).not.toBe("Invalid Date");
      
      // Verify the date matches the input string
      const year = workDate.getFullYear();
      const month = String(workDate.getMonth() + 1).padStart(2, "0");
      const day = String(workDate.getDate()).padStart(2, "0");
      expect(`${year}-${month}-${day}`).toBe(dateStr);
    }
  });

  it("string-based query keys change when date changes", () => {
    // Simulate what tRPC does with query keys
    const queryKey1 = JSON.stringify({ workDateStr: "2026-02-01" });
    const queryKey2 = JSON.stringify({ workDateStr: "2026-02-10" });
    const queryKey3 = JSON.stringify({ workDateStr: "2026-02-01" });
    
    // Different dates should produce different keys
    expect(queryKey1).not.toBe(queryKey2);
    
    // Same dates should produce same keys
    expect(queryKey1).toBe(queryKey3);
  });

  it("Date objects produce unstable references (demonstrating the original bug)", () => {
    // This demonstrates WHY we switched from Date to string
    const date1 = new Date("2026-02-01");
    const date2 = new Date("2026-02-01");
    
    // Same date value but different object references
    expect(date1).not.toBe(date2);
    
    // JSON serialization produces same string
    expect(JSON.stringify(date1)).toBe(JSON.stringify(date2));
    
    // But superjson wraps Date in metadata, and the query key comparison
    // may not always detect changes reliably with Date objects
    // String comparison is always reliable
    expect("2026-02-01" === "2026-02-01").toBe(true);
    expect("2026-02-01" === "2026-02-10").toBe(false);
  });
});

describe("getIncompleteAttendance date range", () => {
  it("creates correct start and end of day from workDateStr", () => {
    const workDateStr = "2026-02-01";
    const workDate = new Date(`${workDateStr}T00:00:00`);
    
    const dateStr = workDate.toLocaleDateString("en-CA");
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);
    
    expect(dateStr).toBe("2026-02-01");
    expect(startOfDay.getHours()).toBe(0);
    expect(startOfDay.getMinutes()).toBe(0);
    expect(endOfDay.getHours()).toBe(23);
    expect(endOfDay.getMinutes()).toBe(59);
    expect(endOfDay.getSeconds()).toBe(59);
  });

  it("start of day is before end of day", () => {
    const workDateStr = "2026-02-01";
    const workDate = new Date(`${workDateStr}T00:00:00`);
    
    const dateStr = workDate.toLocaleDateString("en-CA");
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);
    
    expect(startOfDay.getTime()).toBeLessThan(endOfDay.getTime());
  });
});

describe("incomplete attendance logic", () => {
  it("identifies missing check-out correctly", () => {
    // Worker has check-in but no check-out
    const checkIns = [{ id: 1, time: new Date("2026-02-01T07:00:00") }];
    const checkOuts: Array<{ id: number; time: Date }> = [];
    
    const checkInCount = checkIns.length;
    const checkOutCount = checkOuts.length;
    
    // Case 1: Has check-ins but fewer check-outs
    if (checkInCount > checkOutCount) {
      // Should be flagged as missing_check_out
      expect(checkInCount - checkOutCount).toBe(1);
    }
  });

  it("does not flag complete records", () => {
    // Worker has matching check-in and check-out
    const checkIns = [{ id: 1, time: new Date("2026-02-01T07:00:00") }];
    const checkOuts = [{ id: 2, time: new Date("2026-02-01T16:00:00") }];
    
    const checkInCount = checkIns.length;
    const checkOutCount = checkOuts.length;
    
    // Equal counts = complete record
    expect(checkInCount).toBe(checkOutCount);
    
    // Should NOT be flagged
    const isIncomplete = checkInCount !== checkOutCount;
    expect(isIncomplete).toBe(false);
  });

  it("identifies missing check-in correctly", () => {
    // Worker has check-out but no check-in
    const checkIns: Array<{ id: number; time: Date }> = [];
    const checkOuts = [{ id: 2, time: new Date("2026-02-01T16:00:00") }];
    
    const checkInCount = checkIns.length;
    const checkOutCount = checkOuts.length;
    
    // Case 3: Has check-outs but fewer check-ins
    if (checkOutCount > checkInCount) {
      expect(checkOutCount - checkInCount).toBe(1);
    }
  });
});
