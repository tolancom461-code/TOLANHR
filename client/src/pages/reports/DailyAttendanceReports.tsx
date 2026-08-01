import { useState, useMemo, Fragment } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, FileCheck } from 'lucide-react';
import { groupDailyAttendanceRows, computeDailyAttendanceGrandTotals } from '@shared/dailyAttendanceReportGrouping';

// تحويل الأرقام إلى كلمات عربية
function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر ريال سعودي';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
    'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertBelow1000(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return one === 0 ? tens[ten] : `${ones[one]} و${tens[ten]}`;
    }
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0 ? hundreds[h] : `${hundreds[h]} و${convertBelow1000(rest)}`;
  }

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  const millions = Math.floor(intPart / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const remainder = intPart % 1000;

  const chunks: string[] = [];
  if (millions > 0) chunks.push(`${convertBelow1000(millions)} مليون`);
  if (thousands > 0) chunks.push(`${convertBelow1000(thousands)} ألف`);
  if (remainder > 0) chunks.push(convertBelow1000(remainder));

  let result = chunks.join(' و');
  result += ' ريال سعودي';
  if (decPart > 0) {
    result += ` و${convertBelow1000(decPart)} هللة`;
  }
  result += ' فقط لا غير';
  return result.trim();
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

export default function DailyAttendanceReports() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toLocaleDateString('en-CA'));
  const [endDate, setEndDate] = useState(today.toLocaleDateString('en-CA'));
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | undefined>();
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [allWorkersSelected, setAllWorkersSelected] = useState(true);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
  const [queryEnabled, setQueryEnabled] = useState(false);

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: groups } = trpc.dailyAttendanceReports.getGroups.useQuery(
    { costCenterId: selectedCostCenterId },
    { enabled: true }
  );

  // قائمة العمال تأتي من نفس بيانات التقرير، قبل تطبيق فلتر العمال.
  const { data: availableWorkers, isLoading: workersLoading } = trpc.dailyAttendanceReports.getReport.useQuery(
    {
      periodStart: startDate,
      periodEnd: endDate,
      costCenterId: selectedCostCenterId,
      groupIds: selectedGroupIds,
    },
    { enabled: selectedGroupIds.length > 0 }
  );

  const { data: reportData, isLoading } = trpc.dailyAttendanceReports.getReport.useQuery(
    {
      periodStart: startDate,
      periodEnd: endDate,
      costCenterId: selectedCostCenterId,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      workerIds: allWorkersSelected ? undefined : selectedWorkerIds,
    },
    { enabled: queryEnabled }
  );

  const groupBlocks = useMemo(() => (reportData ? groupDailyAttendanceRows(reportData) : []), [reportData]);
  const grandTotals = useMemo(
    () => (reportData ? computeDailyAttendanceGrandTotals(reportData) : { workerCount: 0, baseAmount: 0, totalDeductions: 0, totalBonuses: 0, netAmount: 0 }),
    [reportData]
  );

  const handleSelectAllGroups = () => {
    if (groups) {
      setSelectedGroupIds(groups.map(g => g.id));
      setAllWorkersSelected(true);
      setSelectedWorkerIds([]);
    }
  };
  const handleDeselectAllGroups = () => {
    setSelectedGroupIds([]);
    setAllWorkersSelected(true);
    setSelectedWorkerIds([]);
  };
  const toggleGroup = (id: number) => {
    setSelectedGroupIds(prev => (prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]));
    setAllWorkersSelected(true);
    setSelectedWorkerIds([]);
  };

  const handleSelectAllWorkers = () => {
    setAllWorkersSelected(true);
    setSelectedWorkerIds([]);
  };

  const handleDeselectAllWorkers = () => {
    setAllWorkersSelected(false);
    setSelectedWorkerIds([]);
  };

  const toggleWorker = (id: number) => {
    setAllWorkersSelected(false);
    setSelectedWorkerIds(prev => (prev.includes(id) ? prev.filter(workerId => workerId !== id) : [...prev, id]));
  };

  const handleCostCenterChange = (val: string) => {
    const id = val === 'all' ? undefined : parseInt(val);
    setSelectedCostCenterId(id);
    setSelectedGroupIds([]);
    setAllWorkersSelected(true);
    setSelectedWorkerIds([]);
    setQueryEnabled(false);
  };

  const exportPdfMutation = trpc.dailyAttendanceReports.exportPdf.useMutation();
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const result = await exportPdfMutation.mutateAsync({
        periodStart: startDate,
        periodEnd: endDate,
        costCenterId: selectedCostCenterId,
        groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
        workerIds: allWorkersSelected ? undefined : selectedWorkerIds,
      });
      const byteChars = atob(result.data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExportingPdf(false);
    }
  };

  let rowCounter = 0;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4">

      {/* قسم الفلاتر - يُخفى عند الطباعة */}
      <div className="no-print bg-white rounded-xl shadow p-6 mb-6 border border-blue-100">
        <h2 className="text-lg font-bold text-blue-800 mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5" />
          إعدادات التقرير
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="space-y-1">
            <Label>من تاريخ</Label>
            <Input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setAllWorkersSelected(true);
                setSelectedWorkerIds([]);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>إلى تاريخ</Label>
            <Input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setAllWorkersSelected(true);
                setSelectedWorkerIds([]);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>مركز التكلفة</Label>
            <Select onValueChange={handleCostCenterChange} defaultValue="all">
              <SelectTrigger>
                <SelectValue placeholder="جميع مراكز التكلفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع مراكز التكلفة</SelectItem>
                {costCenters?.map(cc => (
                  <SelectItem key={cc.id} value={cc.id.toString()}>{cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-blue-700 hover:bg-blue-800 text-white"
              onClick={() => setQueryEnabled(true)}
            >
              عرض التقرير
            </Button>
          </div>
        </div>

        {/* تصفية المجموعات */}
        {groups && groups.length > 0 && (
          <div className="border border-blue-100 rounded-lg p-4 bg-blue-50">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-semibold text-blue-800 text-sm">تصفية المجموعات:</span>
              <button onClick={handleSelectAllGroups} className="text-xs text-blue-600 hover:underline">تحديد الكل</button>
              <button onClick={handleDeselectAllGroups} className="text-xs text-red-500 hover:underline">إلغاء الكل</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {groups.map(g => (
                <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedGroupIds.includes(g.id)}
                    onCheckedChange={() => toggleGroup(g.id)}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* تصفية العمال من نفس بيانات التقرير */}
        {selectedGroupIds.length > 0 && (
          <div className="border border-green-100 rounded-lg p-4 bg-green-50 mt-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="font-semibold text-green-800 text-sm">تصفية العمال:</span>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={allWorkersSelected}
                  onCheckedChange={(checked) => {
                    if (checked) handleSelectAllWorkers();
                    else handleDeselectAllWorkers();
                  }}
                />
                <span>جميع عمال المجموعات المحددة</span>
              </label>
              <button onClick={handleSelectAllWorkers} className="text-xs text-blue-600 hover:underline">تحديد الكل</button>
              <button onClick={handleDeselectAllWorkers} className="text-xs text-red-500 hover:underline">إلغاء الكل</button>
              {!allWorkersSelected && (
                <span className="text-xs text-green-700">تم اختيار {selectedWorkerIds.length} عامل</span>
              )}
            </div>

            {workersLoading ? (
              <div className="text-sm text-gray-500">جاري تحميل العمال...</div>
            ) : availableWorkers && availableWorkers.length > 0 ? (
              !allWorkersSelected && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {availableWorkers.map(worker => (
                    <label key={worker.workerId} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedWorkerIds.includes(worker.workerId)}
                        onCheckedChange={() => toggleWorker(worker.workerId)}
                      />
                      <span>{worker.workerName} ({worker.workerCode})</span>
                    </label>
                  ))}
                </div>
              )
            ) : (
              <div className="text-sm text-gray-500">لا يوجد عمال لهم بيانات في الفترة والمجموعات المحددة</div>
            )}
          </div>
        )}
      </div>

      {/* زر الطباعة */}
      {reportData && reportData.length > 0 && (
        <div className="no-print flex justify-end gap-3 mb-4">
          <Button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="bg-blue-700 hover:bg-blue-800 text-white flex items-center gap-2"
          >
            <FileCheck className="h-4 w-4" />
            {isExportingPdf ? 'جاري إنشاء الملف...' : 'تنزيل PDF'}
          </Button>
        </div>
      )}

      {/* محتوى التقرير */}
      {queryEnabled && (
        <div id="print-report" className="bg-white shadow-lg rounded-xl print-area p-8">
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold">كشف العمالة اليومية</h2>
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span>الفترة: {startDate} إلى {endDate}</span>
            <span></span>
          </div>

          {isLoading ? (
            <div className="text-center py-20 text-gray-400">جاري تحميل البيانات...</div>
          ) : reportData && reportData.length > 0 ? (
            <>
              <table className="w-full border-collapse text-sm mb-6" style={{ borderColor: '#333' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-700 px-2 py-2 text-right">#</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">العامل</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">الرمز</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">أيام العمل</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">المستحق</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">الخصومات</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">الاضافي</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">الصافي</th>
                    <th className="border border-gray-700 px-2 py-2 text-right">توقيع المستلم</th>
                  </tr>
                </thead>
                <tbody>
                  {groupBlocks.map((group) => (
                    <Fragment key={group.groupId}>
                      <tr key={`h-${group.groupId}`} className="bg-blue-100 font-bold">
                        <td colSpan={9} className="border border-gray-700 px-2 py-2">
                          {group.groupName} ({group.items.length} عامل)
                        </td>
                      </tr>
                      {group.items.map((item) => {
                        rowCounter++;
                        return (
                          <tr key={item.workerId}>
                            <td className="border border-gray-700 px-2 py-2">{rowCounter}</td>
                            <td className="border border-gray-700 px-2 py-2">{item.workerName}</td>
                            <td className="border border-gray-700 px-2 py-2">{item.workerCode}</td>
                            <td className="border border-gray-700 px-2 py-2 text-center">{item.daysWorked}</td>
                            <td className="border border-gray-700 px-2 py-2">{formatAmount(item.baseAmount)}</td>
                            <td className="border border-gray-700 px-2 py-2 text-red-600">{formatAmount(item.totalDeductions)}</td>
                            <td className="border border-gray-700 px-2 py-2 text-green-600">{formatAmount(item.totalBonuses)}</td>
                            <td className="border border-gray-700 px-2 py-2 font-bold">{formatAmount(item.netAmount)}</td>
                            <td className="border border-gray-700 px-2 py-2"></td>
                          </tr>
                        );
                      })}
                      <tr key={`t-${group.groupId}`} className="bg-blue-50 font-bold text-xs">
                        <td colSpan={4} className="border border-gray-700 px-2 py-2">إجمالي {group.groupName}</td>
                        <td className="border border-gray-700 px-2 py-2">{formatAmount(group.totals.baseAmount)}</td>
                        <td className="border border-gray-700 px-2 py-2 text-red-600">{formatAmount(group.totals.totalDeductions)}</td>
                        <td className="border border-gray-700 px-2 py-2 text-green-600">{formatAmount(group.totals.totalBonuses)}</td>
                        <td className="border border-gray-700 px-2 py-2 font-bold">{formatAmount(group.totals.netAmount)}</td>
                        <td className="border border-gray-700 px-2 py-2"></td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="bg-gray-200 font-bold">
                    <td colSpan={4} className="border border-gray-700 px-2 py-2">الإجمالي</td>
                    <td className="border border-gray-700 px-2 py-2">{formatAmount(grandTotals.baseAmount)}</td>
                    <td className="border border-gray-700 px-2 py-2">{formatAmount(grandTotals.totalDeductions)}</td>
                    <td className="border border-gray-700 px-2 py-2">{formatAmount(grandTotals.totalBonuses)}</td>
                    <td className="border border-gray-700 px-2 py-2">{formatAmount(grandTotals.netAmount)}</td>
                    <td className="border border-gray-700 px-2 py-2"></td>
                  </tr>
                  <tr>
                    <td colSpan={9} className="bg-blue-50 text-blue-900 font-semibold text-sm px-3 py-2" style={{ borderTop: '2px solid #4a90d9' }}>
                      المبلغ الإجمالي بالأحرف: {numberToArabicWords(grandTotals.netAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد بيانات للفترة والفلاتر المحددة</p>
            </div>
          )}
        </div>
      )}

      {/* CSS للطباعة */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-report, #print-report * { visibility: visible; }
          #print-report { position: absolute; top: 0; right: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
