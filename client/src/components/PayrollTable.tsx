import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

export interface PayrollRow {
  workerId: number;
  workerName: string;
  workerCode?: string;
  daysWorked: number;
  baseAmount: string;
  deductions: string;
  bonuses: string;
  netAmount: string;
  notes?: string;
}

interface PayrollTableProps {
  data: PayrollRow[];
  isLoading?: boolean;
  onRowClick?: (row: PayrollRow) => void;
}

type SortField = 'workerName' | 'daysWorked' | 'baseAmount' | 'deductions' | 'bonuses' | 'netAmount';
type SortOrder = 'asc' | 'desc';

export function PayrollTable({ data, isLoading = false, onRowClick }: PayrollTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('workerName');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Filter data based on search term
  const filteredData = data.filter(row =>
    row.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (row.workerCode && row.workerCode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any = a[sortField];
    let bValue: any = b[sortField];

    // Convert strings to numbers for comparison
    if (typeof aValue === 'string' && !isNaN(parseFloat(aValue))) {
      aValue = parseFloat(aValue);
    }
    if (typeof bValue === 'string' && !isNaN(parseFloat(bValue))) {
      bValue = parseFloat(bValue);
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleRowExpand = (workerId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(workerId)) {
      newExpanded.delete(workerId);
    } else {
      newExpanded.add(workerId);
    }
    setExpandedRows(newExpanded);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-4 h-4" />;
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>تفاصيل الأجور</CardTitle>
          <div className="relative w-64">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث عن عامل..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-muted-foreground">جاري تحميل البيانات...</p>
          </div>
        ) : sortedData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">لا توجد بيانات للعرض</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 bg-muted/50">
                  <th className="text-right py-3 px-2 w-8"></th>
                  <th 
                    className="text-right py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('workerName')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      اسم العامل
                      <SortIcon field="workerName" />
                    </div>
                  </th>
                  <th 
                    className="text-center py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('daysWorked')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      الأيام
                      <SortIcon field="daysWorked" />
                    </div>
                  </th>
                  <th 
                    className="text-center py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('baseAmount')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      الأساسي
                      <SortIcon field="baseAmount" />
                    </div>
                  </th>
                  <th 
                    className="text-center py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('deductions')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      الخصومات
                      <SortIcon field="deductions" />
                    </div>
                  </th>
                  <th 
                    className="text-center py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('bonuses')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      المكافآت
                      <SortIcon field="bonuses" />
                    </div>
                  </th>
                  <th 
                    className="text-center py-3 px-2 cursor-pointer hover:bg-muted font-semibold"
                    onClick={() => handleSort('netAmount')}
                  >
                    <div className="flex items-center gap-2 justify-center">
                      الصافي
                      <SortIcon field="netAmount" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((row) => (
                  <React.Fragment key={row.workerId}>
                    <tr 
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onRowClick?.(row)}
                    >
                      <td className="py-3 px-2 text-center">
                        {row.notes && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpand(row.workerId);
                            }}
                            className="p-1 hover:bg-muted rounded"
                          >
                            {expandedRows.has(row.workerId) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="text-right py-3 px-2 font-medium">
                        <div>{row.workerName}</div>
                        {row.workerCode && (
                          <div className="text-xs text-muted-foreground">{row.workerCode}</div>
                        )}
                      </td>
                      <td className="text-center py-3 px-2">{row.daysWorked}</td>
                      <td className="text-center py-3 px-2">{parseFloat(row.baseAmount).toFixed(2)}</td>
                      <td className="text-center py-3 px-2 text-red-600">
                        {parseFloat(row.deductions).toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-2 text-green-600">
                        {parseFloat(row.bonuses).toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-2 font-bold text-purple-600">
                        {parseFloat(row.netAmount).toFixed(2)}
                      </td>
                    </tr>
                    {expandedRows.has(row.workerId) && row.notes && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={7} className="py-3 px-4">
                          <div className="bg-white dark:bg-slate-800 p-3 rounded border border-muted">
                            <div className="text-sm font-semibold mb-2">ملاحظات:</div>
                            <div className="text-sm text-muted-foreground">{row.notes}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Summary Footer */}
        {sortedData.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">إجمالي الأيام:</span>
                <div className="font-bold">{sortedData.reduce((sum, r) => sum + r.daysWorked, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">إجمالي الأساسي:</span>
                <div className="font-bold">
                  {sortedData.reduce((sum, r) => sum + parseFloat(r.baseAmount), 0).toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">إجمالي الخصومات:</span>
                <div className="font-bold text-red-600">
                  {sortedData.reduce((sum, r) => sum + parseFloat(r.deductions), 0).toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">إجمالي المكافآت:</span>
                <div className="font-bold text-green-600">
                  {sortedData.reduce((sum, r) => sum + parseFloat(r.bonuses), 0).toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">الصافي الإجمالي:</span>
                <div className="font-bold text-purple-600">
                  {sortedData.reduce((sum, r) => sum + parseFloat(r.netAmount), 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
