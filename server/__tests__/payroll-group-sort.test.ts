import { describe, it, expect } from 'vitest';

// Test the grouping logic used in PayrollBatchHistory
function groupItemsByGroup(items: any[]) {
  const grouped: Record<string, { groupName: string; items: any[] }> = {};
  items.forEach((item: any) => {
    const gName = item.groupName || 'بدون مجموعة';
    if (!grouped[gName]) {
      grouped[gName] = { groupName: gName, items: [] };
    }
    grouped[gName].items.push(item);
  });
  return Object.values(grouped);
}

describe('Payroll Batch History - Group by Group', () => {
  const sampleItems = [
    { id: 1, workerName: 'أحمد', workerCode: 'W01', groupName: 'مجموعة أ', groupId: 1, daysWorked: 5, baseAmount: '400', totalDeductions: '50', totalBonuses: '0', netAmount: '350' },
    { id: 2, workerName: 'محمد', workerCode: 'W02', groupName: 'مجموعة ب', groupId: 2, daysWorked: 3, baseAmount: '240', totalDeductions: '30', totalBonuses: '10', netAmount: '220' },
    { id: 3, workerName: 'خالد', workerCode: 'W03', groupName: 'مجموعة أ', groupId: 1, daysWorked: 4, baseAmount: '320', totalDeductions: '40', totalBonuses: '20', netAmount: '300' },
    { id: 4, workerName: 'سعد', workerCode: 'W04', groupName: 'مجموعة ب', groupId: 2, daysWorked: 6, baseAmount: '480', totalDeductions: '60', totalBonuses: '0', netAmount: '420' },
    { id: 5, workerName: 'فهد', workerCode: 'W05', groupName: 'مجموعة أ', groupId: 1, daysWorked: 2, baseAmount: '160', totalDeductions: '20', totalBonuses: '0', netAmount: '140' },
  ];

  it('should group workers by their group name', () => {
    const groups = groupItemsByGroup(sampleItems);
    expect(groups.length).toBe(2);
    expect(groups[0].groupName).toBe('مجموعة أ');
    expect(groups[1].groupName).toBe('مجموعة ب');
  });

  it('should place correct workers in each group', () => {
    const groups = groupItemsByGroup(sampleItems);
    const groupA = groups.find(g => g.groupName === 'مجموعة أ');
    const groupB = groups.find(g => g.groupName === 'مجموعة ب');

    expect(groupA!.items.length).toBe(3);
    expect(groupB!.items.length).toBe(2);

    expect(groupA!.items.map(i => i.workerCode)).toEqual(['W01', 'W03', 'W05']);
    expect(groupB!.items.map(i => i.workerCode)).toEqual(['W02', 'W04']);
  });

  it('should calculate correct group subtotals', () => {
    const groups = groupItemsByGroup(sampleItems);
    const groupA = groups.find(g => g.groupName === 'مجموعة أ')!;

    const groupABase = groupA.items.reduce((s, i) => s + parseFloat(i.baseAmount), 0);
    const groupADed = groupA.items.reduce((s, i) => s + parseFloat(i.totalDeductions), 0);
    const groupABon = groupA.items.reduce((s, i) => s + parseFloat(i.totalBonuses), 0);
    const groupANet = groupA.items.reduce((s, i) => s + parseFloat(i.netAmount), 0);

    expect(groupABase).toBe(880); // 400 + 320 + 160
    expect(groupADed).toBe(110);  // 50 + 40 + 20
    expect(groupABon).toBe(20);   // 0 + 20 + 0
    expect(groupANet).toBe(790);  // 350 + 300 + 140
  });

  it('should handle workers without a group', () => {
    const itemsWithNoGroup = [
      ...sampleItems,
      { id: 6, workerName: 'علي', workerCode: 'W06', groupName: null, groupId: null, daysWorked: 1, baseAmount: '80', totalDeductions: '10', totalBonuses: '0', netAmount: '70' },
    ];
    const groups = groupItemsByGroup(itemsWithNoGroup);
    expect(groups.length).toBe(3);
    const noGroup = groups.find(g => g.groupName === 'بدون مجموعة');
    expect(noGroup).toBeDefined();
    expect(noGroup!.items.length).toBe(1);
    expect(noGroup!.items[0].workerCode).toBe('W06');
  });

  it('should handle empty items array', () => {
    const groups = groupItemsByGroup([]);
    expect(groups.length).toBe(0);
  });

  it('should handle single group', () => {
    const singleGroupItems = sampleItems.filter(i => i.groupName === 'مجموعة أ');
    const groups = groupItemsByGroup(singleGroupItems);
    expect(groups.length).toBe(1);
    expect(groups[0].groupName).toBe('مجموعة أ');
    expect(groups[0].items.length).toBe(3);
  });

  it('should only include workers present in the batch (no absent workers)', () => {
    // This test verifies the concept: only items in the batch are grouped
    // Absent workers are never included in batchDetails.items from the API
    const batchItems = sampleItems.filter(i => i.workerCode !== 'W03'); // W03 is "absent"
    const groups = groupItemsByGroup(batchItems);
    const groupA = groups.find(g => g.groupName === 'مجموعة أ')!;
    expect(groupA.items.length).toBe(2); // Only W01 and W05, not W03
    expect(groupA.items.map(i => i.workerCode)).toEqual(['W01', 'W05']);
  });
});
