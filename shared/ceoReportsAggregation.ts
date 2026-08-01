// ============================================
// منطق تقرير CEO المشترك بين المعاينة وملف PDF
// ============================================

export interface CeoReportGroupRow {
  rowIndex: number;
  groupId: number;
  groupName: string;
  costCenterId: number;
  workerCount: number;
  totalSalary: number;
  totalDeductions: number;
  totalBonuses: number;
  totalNet: number;
}

export type CeoShiftCategory = "morning" | "evening";

export interface CeoShiftAggregateRow {
  category: CeoShiftCategory;
  label: string;
  workerCount: number;
  totalSalary: number;
  totalDeductions: number;
  totalBonuses: number;
  totalNet: number;
}

export interface CeoReportCostCenter {
  id: number;
  name: string;
  code?: string | null;
}

export interface CeoReportSection {
  key: string;
  costCenterId: number;
  costCenterName: string;
  costCenterCode?: string | null;
  categories: CeoShiftCategory[];
  title: string;
  rows: CeoShiftAggregateRow[];
}

export const CEO_SHIFT_CATEGORIES: CeoShiftCategory[] = ["morning", "evening"];

export const CEO_SHIFT_LABELS: Record<CeoShiftCategory, string> = {
  morning: "مصاريف التشغيل الصباحي",
  evening: "مصاريف التشغيل المسائي",
};

export const CEO_REPORT_TITLE = "المصاريف ليوم الخميس";

/**
 * يجمع المجموعات المصنفة صباحياً أو مسائياً فقط.
 * أي مجموعة غير موجودة في القائمتين يتم تجاهلها نهائياً.
 */
export function aggregateCeoReportByShift(
  rows: CeoReportGroupRow[],
  morningGroupIds: number[],
  eveningGroupIds: number[],
  selectedShifts: CeoShiftCategory[] = CEO_SHIFT_CATEGORIES
): CeoShiftAggregateRow[] {
  const morningSet = new Set(morningGroupIds);
  const eveningSet = new Set(eveningGroupIds);
  const selectedShiftSet = new Set(selectedShifts);

  const totals: Record<CeoShiftCategory, CeoShiftAggregateRow> = {
    morning: {
      category: "morning",
      label: CEO_SHIFT_LABELS.morning,
      workerCount: 0,
      totalSalary: 0,
      totalDeductions: 0,
      totalBonuses: 0,
      totalNet: 0,
    },
    evening: {
      category: "evening",
      label: CEO_SHIFT_LABELS.evening,
      workerCount: 0,
      totalSalary: 0,
      totalDeductions: 0,
      totalBonuses: 0,
      totalNet: 0,
    },
  };

  for (const row of rows) {
    const category: CeoShiftCategory | undefined = morningSet.has(row.groupId)
      ? "morning"
      : eveningSet.has(row.groupId)
        ? "evening"
        : undefined;

    if (!category || !selectedShiftSet.has(category)) continue;

    const bucket = totals[category];
    bucket.workerCount += row.workerCount;
    bucket.totalSalary += row.totalSalary;
    bucket.totalDeductions += row.totalDeductions;
    bucket.totalBonuses += row.totalBonuses;
    bucket.totalNet += row.totalNet;
  }

  const isEmpty = (row: CeoShiftAggregateRow) =>
    row.workerCount === 0 &&
    row.totalSalary === 0 &&
    row.totalDeductions === 0 &&
    row.totalBonuses === 0 &&
    row.totalNet === 0;

  return CEO_SHIFT_CATEGORIES.filter(category => selectedShiftSet.has(category))
    .map(category => totals[category])
    .filter(row => !isEmpty(row));
}

export function getCeoReportSectionTitle(
  _categories: CeoShiftCategory[],
  _costCenterName: string,
  reportTitle?: string
): string {
  return reportTitle?.trim() || CEO_REPORT_TITLE;
}

/**
 * ينشئ أقسام/صفحات التقرير بنفس القواعد للواجهة وPDF:
 * - كل مركز تكلفة له قسم مستقل.
 * - عند الدمج: قسم واحد للفترات المختارة.
 * - دون الدمج: قسم مستقل لكل فترة مختارة.
 */
export function createCeoReportSections(input: {
  rows: CeoReportGroupRow[];
  costCenters: CeoReportCostCenter[];
  morningGroupIds: number[];
  eveningGroupIds: number[];
  selectedShifts: CeoShiftCategory[];
  mergeShifts: boolean;
  reportTitle?: string;
}): CeoReportSection[] {
  const selectedShiftSet = new Set(input.selectedShifts);
  const selectedShifts = CEO_SHIFT_CATEGORIES.filter(category =>
    selectedShiftSet.has(category)
  );

  if (selectedShifts.length === 0) return [];

  return input.costCenters.flatMap(costCenter => {
    const costCenterRows = input.rows.filter(
      row => row.costCenterId === costCenter.id
    );
    const aggregateRows = aggregateCeoReportByShift(
      costCenterRows,
      input.morningGroupIds,
      input.eveningGroupIds,
      selectedShifts
    );
    const sectionCategories =
      input.mergeShifts || selectedShifts.length === 1
        ? [selectedShifts]
        : selectedShifts.map(category => [category]);

    return sectionCategories.map(categories => ({
      key: `${costCenter.id}:${categories.join("+")}`,
      costCenterId: costCenter.id,
      costCenterName: costCenter.name,
      costCenterCode: costCenter.code,
      categories,
      title: getCeoReportSectionTitle(
        categories,
        costCenter.name,
        input.reportTitle
      ),
      rows: aggregateRows.filter(row => categories.includes(row.category)),
    }));
  });
}
