// ============================================
// تجميع بيانات "تقارير يومية" (كشف العمالة التفصيلي لكل عامل)
// ملف مشترك بين الواجهة (المعاينة الحية) والخادم (توليد PDF)
// حتى تبقى المعاينة ونسخة PDF متطابقتين دائماً 100%.
// ============================================

export interface DailyAttendanceWorkerRow {
  workerId: number;
  workerName: string;
  workerCode: string;
  groupId: number;
  groupName: string;
  daysWorked: number;
  baseAmount: number;
  totalDeductions: number;
  totalBonuses: number;
  netAmount: number;
}

export interface DailyAttendanceGroupBlock {
  groupId: number;
  groupName: string;
  items: DailyAttendanceWorkerRow[];
  totals: {
    baseAmount: number;
    totalDeductions: number;
    totalBonuses: number;
    netAmount: number;
  };
}

export interface DailyAttendanceGrandTotals {
  workerCount: number;
  baseAmount: number;
  totalDeductions: number;
  totalBonuses: number;
  netAmount: number;
}

/** يجمّع صفوف العمال إلى كتل حسب المجموعة، مع مجموع فرعي لكل مجموعة. */
export function groupDailyAttendanceRows(rows: DailyAttendanceWorkerRow[]): DailyAttendanceGroupBlock[] {
  const map = new Map<number, DailyAttendanceGroupBlock>();

  for (const row of rows) {
    let block = map.get(row.groupId);
    if (!block) {
      block = {
        groupId: row.groupId,
        groupName: row.groupName,
        items: [],
        totals: { baseAmount: 0, totalDeductions: 0, totalBonuses: 0, netAmount: 0 },
      };
      map.set(row.groupId, block);
    }
    block.items.push(row);
    block.totals.baseAmount += row.baseAmount;
    block.totals.totalDeductions += row.totalDeductions;
    block.totals.totalBonuses += row.totalBonuses;
    block.totals.netAmount += row.netAmount;
  }

  return Array.from(map.values());
}

/** إجمالي عام لكل الصفوف بغض النظر عن المجموعة. */
export function computeDailyAttendanceGrandTotals(rows: DailyAttendanceWorkerRow[]): DailyAttendanceGrandTotals {
  return rows.reduce(
    (acc, row) => ({
      workerCount: acc.workerCount + 1,
      baseAmount: acc.baseAmount + row.baseAmount,
      totalDeductions: acc.totalDeductions + row.totalDeductions,
      totalBonuses: acc.totalBonuses + row.totalBonuses,
      netAmount: acc.netAmount + row.netAmount,
    }),
    { workerCount: 0, baseAmount: 0, totalDeductions: 0, totalBonuses: 0, netAmount: 0 }
  );
}
