import { describe, expect, it } from "vitest";
import {
  aggregateCeoReportByShift,
  createCeoReportSections,
  type CeoReportGroupRow,
} from "../../shared/ceoReportsAggregation";

const rows: CeoReportGroupRow[] = [
  {
    rowIndex: 1,
    groupId: 11,
    groupName: "صباحي تولان",
    costCenterId: 1,
    workerCount: 2,
    totalSalary: 200,
    totalDeductions: 20,
    totalBonuses: 10,
    totalNet: 190,
  },
  {
    rowIndex: 2,
    groupId: 12,
    groupName: "مسائي تولان",
    costCenterId: 1,
    workerCount: 1,
    totalSalary: 100,
    totalDeductions: 5,
    totalBonuses: 0,
    totalNet: 95,
  },
  {
    rowIndex: 3,
    groupId: 13,
    groupName: "غير محددة",
    costCenterId: 1,
    workerCount: 9,
    totalSalary: 900,
    totalDeductions: 0,
    totalBonuses: 0,
    totalNet: 900,
  },
  {
    rowIndex: 4,
    groupId: 21,
    groupName: "صباحي الملقا",
    costCenterId: 2,
    workerCount: 3,
    totalSalary: 300,
    totalDeductions: 0,
    totalBonuses: 30,
    totalNet: 330,
  },
  {
    rowIndex: 5,
    groupId: 22,
    groupName: "مسائي الملقا",
    costCenterId: 2,
    workerCount: 4,
    totalSalary: 400,
    totalDeductions: 40,
    totalBonuses: 0,
    totalNet: 360,
  },
];

describe("CEO report aggregation", () => {
  it("ignores groups that are not classified as morning or evening", () => {
    const result = aggregateCeoReportByShift(rows, [11, 21], [12, 22]);

    expect(result).toHaveLength(2);
    expect(result.map(row => row.category)).toEqual(["morning", "evening"]);
    expect(result[0].totalNet).toBe(520);
    expect(result[1].totalNet).toBe(455);
    expect(result.reduce((sum, row) => sum + row.totalNet, 0)).toBe(975);
  });

  it("returns only the selected operating period", () => {
    const result = aggregateCeoReportByShift(
      rows,
      [11, 21],
      [12, 22],
      ["morning"]
    );

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("morning");
  });

  it("creates one merged section for each selected cost center", () => {
    const sections = createCeoReportSections({
      rows,
      costCenters: [
        { id: 1, name: "تولان", code: "CC01" },
        { id: 2, name: "الملقا", code: "CC06" },
      ],
      morningGroupIds: [11, 21],
      eveningGroupIds: [12, 22],
      selectedShifts: ["morning", "evening"],
      mergeShifts: true,
    });

    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("تقرير كشف العمالة اليومية");
    expect(sections[0].rows.map(row => row.category)).toEqual([
      "morning",
      "evening",
    ]);
    expect(sections[1].costCenterName).toBe("الملقا");
  });

  it("creates a separate section for every cost center and shift", () => {
    const sections = createCeoReportSections({
      rows,
      costCenters: [
        { id: 1, name: "تولان" },
        { id: 2, name: "الملقا" },
      ],
      morningGroupIds: [11, 21],
      eveningGroupIds: [12, 22],
      selectedShifts: ["morning", "evening"],
      mergeShifts: false,
    });

    expect(sections).toHaveLength(4);
    expect(sections.map(section => section.title)).toEqual([
      "تقرير كشف العمالة اليومية",
      "تقرير كشف العمالة اليومية",
      "تقرير كشف العمالة اليومية",
      "تقرير كشف العمالة اليومية",
    ]);
    expect(sections.every(section => section.rows.length === 1)).toBe(true);
  });

  it("keeps the selected section but hides an aggregate row whose totals are zero", () => {
    const sections = createCeoReportSections({
      rows: [
        {
          rowIndex: 1,
          groupId: 31,
          groupName: "فارغة",
          costCenterId: 3,
          workerCount: 0,
          totalSalary: 0,
          totalDeductions: 0,
          totalBonuses: 0,
          totalNet: 0,
        },
      ],
      costCenters: [{ id: 3, name: "تجريبي" }],
      morningGroupIds: [31],
      eveningGroupIds: [],
      selectedShifts: ["morning"],
      mergeShifts: true,
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].rows).toEqual([]);
  });
});
