import { useState, useRef, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Printer, Eye, AlertCircle } from 'lucide-react';
import { numberToArabicWords } from '@/lib/numberToArabicWords';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { useReactToPrint } from 'react-to-print';

export default function PayrollReport() {
  const printRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Filter states
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | undefined>();
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [showReport, setShowReport] = useState(false);

  // Queries
  const costCentersQuery = trpc.costCenters.list.useQuery();
  const groupsQuery = trpc.groups.list.useQuery();

  // Filtered groups based on selected cost center
  const filteredGroups = useMemo(() => {
    if (!groupsQuery.data) return [];
    if (!selectedCostCenterId) return groupsQuery.data;
    return groupsQuery.data.filter((g: any) => g.costCenterId === selectedCostCenterId);
  }, [groupsQuery.data, selectedCostCenterId]);

  // Report query - always uses summary with filters
  const reportQuery = trpc.payroll.getReportSummary.useQuery(
    {
      periodStart,
      periodEnd,
      costCenterId: selectedCostCenterId,
      groupId: selectedGroupId,
    },
    { enabled: showReport }
  );

  const reportData = reportQuery.data || [];

  // Calculate totals
  const totals = useMemo(() => {
    if (!reportData || reportData.length === 0) {
      return {
        totalWorkers: 0,
        totalSalary: '0.00',
        totalDeductions: '0.00',
        totalBonuses: '0.00',
        totalNet: '0.00',
      };
    }

    let totalWorkers = 0;
    let totalSalary = 0;
    let totalDeductions = 0;
    let totalBonuses = 0;
    let totalNet = 0;

    reportData.forEach((row: any) => {
      totalWorkers += row.workerCount || 1;
      totalSalary += parseFloat(row.totalSalary || '0');
      totalDeductions += parseFloat(row.totalDeductions || '0');
      totalBonuses += parseFloat(row.totalBonuses || '0');
      totalNet += parseFloat(row.totalNet || '0');
    });

    return {
      totalWorkers,
      totalSalary: totalSalary.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      totalBonuses: totalBonuses.toFixed(2),
      totalNet: totalNet.toFixed(2),
    };
  }, [reportData]);

  // Get dynamic report title
  const getReportTitle = () => {
    if (selectedCostCenterId) {
      const cc = costCentersQuery.data?.find((c: any) => c.id === selectedCostCenterId);
      return `تقرير كشف رواتب العمال اليومية لمركز تكلفة: ${cc?.name || ''}`;
    }
    return 'تقرير كشف رواتب العمال اليومية – جميع مراكز التكلفة';
  };

  // Get selected group name for subtitle
  const getGroupSubtitle = () => {
    if (selectedGroupId) {
      const group = groupsQuery.data?.find((g: any) => g.id === selectedGroupId);
      return `المجموعة: ${group?.name || ''}`;
    }
    return 'جميع المجموعات';
  };

  // Handle view report
  const handleViewReport = () => {
    if (!periodStart || !periodEnd) {
      toast.error('يرجى تحديد الفترة الزمنية (من تاريخ / إلى تاريخ)');
      return;
    }
    setShowReport(true);
  };

  // Handle print
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `تقرير_رواتب_${periodStart}_${periodEnd}`,
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Filter Section */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>فلترة التقرير</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Period Start */}
            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setShowReport(false);
                }}
              />
            </div>

            {/* Period End */}
            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setShowReport(false);
                }}
              />
            </div>

            {/* Cost Center Selection */}
            <div className="space-y-2">
              <Label>مركز التكلفة</Label>
              <Select
                value={selectedCostCenterId?.toString() || 'all'}
                onValueChange={(value) => {
                  const newCostCenterId = value === 'all' ? undefined : parseInt(value);
                  setSelectedCostCenterId(newCostCenterId);
                  // Reset group selection when cost center changes
                  setSelectedGroupId(undefined);
                  setShowReport(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المراكز</SelectItem>
                  {costCentersQuery.data?.map((cc: any) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name} ({cc.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Group Selection - Hierarchical */}
            <div className="space-y-2">
              <Label>المجموعة</Label>
              <Select
                value={selectedGroupId?.toString() || 'all'}
                onValueChange={(value) => {
                  setSelectedGroupId(value === 'all' ? undefined : parseInt(value));
                  setShowReport(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المجموعات</SelectItem>
                  {filteredGroups.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name} ({group.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button onClick={handleViewReport}>
              <Eye className="w-4 h-4 ml-2" />
              عرض التقرير
            </Button>
            {showReport && (
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 ml-2" />
                طباعة
              </Button>
            )}
          </div>

          {/* Warning Message */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              هذا التقرير مالي معتمد ونهائي ولا يمكن تصديره إلى Excel حفاظًا على سلامة البيانات.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Report Section */}
      {showReport && (
        <div ref={printRef} className="bg-white print-report">
          <style>{`
            @media print {
              .no-print { display: none !important; }
              .print-report { 
                padding: 0 !important; 
                margin: 0 !important;
              }
              .print-report .report-card {
                border: none !important;
                box-shadow: none !important;
              }
              .signatures-section {
                page-break-inside: avoid;
                margin-top: 60px !important;
              }
              .signature-box {
                border-top: 1px solid #333 !important;
              }
              body { 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important;
              }
              @page {
                size: A4 landscape;
                margin: 10mm;
              }
            }
          `}</style>
          <Card className="report-card">
            <CardContent className="p-8 space-y-6">
              {/* Report Header */}
              <div className="text-center space-y-3 border-b pb-6">
                <h1 className="text-2xl font-bold text-gray-900">{getReportTitle()}</h1>
                <p className="text-base text-gray-700 font-medium">{getGroupSubtitle()}</p>
                <p className="text-sm text-gray-500">(تقرير معتمد – عرض وطباعة فقط)</p>
              </div>

              {/* Filter Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                <div className="flex">
                  <span className="font-semibold w-32">الفترة:</span>
                  <span>
                    من {periodStart} إلى {periodEnd}
                  </span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-32">مركز التكلفة:</span>
                  <span>
                    {selectedCostCenterId
                      ? costCentersQuery.data?.find((c: any) => c.id === selectedCostCenterId)?.name
                      : 'جميع المراكز'}
                  </span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-32">المجموعة:</span>
                  <span>
                    {selectedGroupId
                      ? groupsQuery.data?.find((g: any) => g.id === selectedGroupId)?.name
                      : 'جميع المجموعات'}
                  </span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-32">طريقة الاحتساب:</span>
                  <span>يومي</span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-32">حالة التقرير:</span>
                  <span className="text-green-600 font-semibold">معتمد</span>
                </div>
                <div className="flex">
                  <span className="font-semibold w-32">تاريخ الإصدار:</span>
                  <span>{new Date().toLocaleDateString('en-CA')}</span>
                </div>
              </div>

              {/* Report Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-100">
                      <TableHead className="text-center font-bold">م</TableHead>
                      <TableHead className="text-center font-bold">اسم المجموعة</TableHead>
                      <TableHead className="text-center font-bold">كود المجموعة</TableHead>
                      <TableHead className="text-center font-bold">عدد العمال</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الرواتب</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الخصم</TableHead>
                      <TableHead className="text-center font-bold">إجمالي الإضافي</TableHead>
                      <TableHead className="text-center font-bold">الإجمالي المستحق</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          لا توجد بيانات للفترة المحددة
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {reportData.map((row: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="text-center">{index + 1}</TableCell>
                            <TableCell className="text-center">{row.groupName}</TableCell>
                            <TableCell className="text-center">{row.groupCode}</TableCell>
                            <TableCell className="text-center">{row.workerCount}</TableCell>
                            <TableCell className="text-center">{row.totalSalary}</TableCell>
                            <TableCell className="text-center">{row.totalDeductions}</TableCell>
                            <TableCell className="text-center">{row.totalBonuses}</TableCell>
                            <TableCell className="text-center font-semibold">{row.totalNet}</TableCell>
                          </TableRow>
                        ))}

                        {/* Grand Total Row */}
                        <TableRow className="bg-gray-100 border-t-2 border-gray-400 font-bold">
                          <TableCell className="text-center" colSpan={3}>
                            الإجمالي العام
                          </TableCell>
                          <TableCell className="text-center">{totals.totalWorkers}</TableCell>
                          <TableCell className="text-center">{totals.totalSalary}</TableCell>
                          <TableCell className="text-center">{totals.totalDeductions}</TableCell>
                          <TableCell className="text-center">{totals.totalBonuses}</TableCell>
                          <TableCell className="text-center">{totals.totalNet}</TableCell>
                        </TableRow>
                        {/* Total in words row */}
                        <TableRow className="bg-gray-50">
                          <TableCell colSpan={8} className="text-right text-sm font-semibold text-gray-700 py-3">
                            المبلغ بالأحرف: {numberToArabicWords(parseFloat(totals.totalNet))}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Signatures Section */}
              <div className="signatures-section mt-16 pt-8">
                <div className="grid grid-cols-6 gap-4 text-center" dir="rtl">
                  {/* Signature 1 - إعداد */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">إعداد</p>
                      <p className="text-xs text-gray-500 mt-1">التوقيع: ____________</p>
                    </div>
                  </div>

                  {/* Signature 2 - مراجعة أولى */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">مراجعة أولى</p>
                      <p className="text-xs text-gray-500 mt-1">التوقيع: ____________</p>
                    </div>
                  </div>

                  {/* Signature 3 - المراجع المالي */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">المراجع المالي</p>
                      <p className="text-xs text-gray-500 mt-1">التوقيع: ____________</p>
                    </div>
                  </div>

                  {/* Signature 4 - رئيس الحسابات */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">رئيس الحسابات</p>
                      <p className="text-xs text-gray-500 mt-1">التوقيع: ____________</p>
                    </div>
                  </div>

                  {/* Signature 5 - تدقيق ومراجعة */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">تدقيق ومراجعة</p>
                      <p className="text-xs text-gray-600 mt-1">م. سعد الزكري</p>
                    </div>
                  </div>

                  {/* Signature 6 - الرئيس التنفيذي */}
                  <div className="flex flex-col items-center">
                    <div className="h-16"></div>
                    <div className="signature-box w-full pt-2 border-t border-gray-400">
                      <p className="font-bold text-sm text-gray-800">الرئيس التنفيذي</p>
                      <p className="text-xs text-gray-600 mt-1">م. زكري بن عبدالله الزكري</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Report Footer - بعد التواقيع */}
              <div className="text-center text-xs text-gray-500 border-t pt-4 mt-12">
                <p>تم إنشاء هذا التقرير بواسطة نظام إدارة العمالة اليومية — تاريخ الطباعة: {new Date().toLocaleDateString('en-GB').replace(/\//g, '-')} | وقت الطباعة: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} — تمت الطباعة بواسطة: {user?.fullName || user?.username || 'غير معروف'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
