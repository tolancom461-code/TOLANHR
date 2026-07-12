import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Printer, FileText, FileCheck } from 'lucide-react';

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

  let result = '';
  if (intPart >= 1000000) {
    result += convertBelow1000(Math.floor(intPart / 1000000)) + ' مليون ';
  }
  if (intPart >= 1000) {
    const thousands = Math.floor((intPart % 1000000) / 1000);
    if (thousands > 0) result += convertBelow1000(thousands) + ' ألف ';
  }
  result += convertBelow1000(intPart % 1000);
  result += ' ريال سعودي';
  if (decPart > 0) {
    result += ` و${convertBelow1000(decPart)} هللة`;
  }
  result += ' فقط لا غير';
  return result.trim();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + ' ر.س';
}

export default function DailyPayrollReport() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toLocaleDateString('en-CA'));
  const [endDate, setEndDate] = useState(today.toLocaleDateString('en-CA'));
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | undefined>();
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [queryEnabled, setQueryEnabled] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Report number
  const reportNumber = `RPT-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const issueTime = today.toLocaleTimeString('ar-SA');
  const issueDate = today.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: groups } = trpc.dailyPayrollReport.getGroups.useQuery(
    { costCenterId: selectedCostCenterId },
    { enabled: true }
  );

  const { data: reportData, isLoading } = trpc.dailyPayrollReport.getReport.useQuery(
    {
      periodStart: startDate,
      periodEnd: endDate,
      costCenterId: selectedCostCenterId,
      groupIds: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
    },
    { enabled: queryEnabled }
  );

  const handleSelectAllGroups = () => {
    if (groups) setSelectedGroupIds(groups.map(g => g.id));
  };

  const handleDeselectAllGroups = () => {
    setSelectedGroupIds([]);
  };

  const toggleGroup = (id: number) => {
    setSelectedGroupIds(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleCostCenterChange = (val: string) => {
    const id = val === 'all' ? undefined : parseInt(val);
    setSelectedCostCenterId(id);
    setSelectedGroupIds([]);
    setQueryEnabled(false);
  };

  const totalSalary = reportData?.reduce((s, r) => s + r.totalSalary, 0) || 0;
  const totalDeductions = reportData?.reduce((s, r) => s + r.totalDeductions, 0) || 0;
  const totalBonuses = reportData?.reduce((s, r) => s + r.totalBonuses, 0) || 0;
  const totalNet = reportData?.reduce((s, r) => s + r.totalNet, 0) || 0;

  const handlePrint = () => {
    window.print();
  };

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
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>إلى تاريخ</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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

        {/* المجموعات الديناميكية */}
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
      </div>

      {/* زر الطباعة */}
      {reportData && reportData.length > 0 && (
        <div className="no-print flex justify-end mb-4">
          <Button
            onClick={handlePrint}
            className="bg-blue-700 hover:bg-blue-800 text-white flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            طباعة التقرير
          </Button>
        </div>
      )}

      {/* محتوى التقرير القابل للطباعة */}
      {queryEnabled && (
        <div
          ref={printRef}
          id="print-report"
          className="bg-white shadow-lg rounded-xl print-area"
        >

          {/* ===== الهيدر ===== */}
<div
  className={`report-header text-white p-6 rounded-t-xl ${
    costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
      ? 'bg-[#B92D38]'
      : 'bg-blue-800'
  }`}
>

            <div className="relative flex justify-center items-start">

              {/* يمين: بيانات التقرير */}
              <div className="absolute right-0 text-sm space-y-1 bg-white/10 backdrop-blur-sm rounded-lg p-3 min-w-[220px]">

                <div className="flex justify-between gap-4">
                  <span className="opacity-80">تاريخ الإصدار:</span>
                  <span className="font-semibold">{issueDate}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="opacity-80">وقت الإصدار:</span>
                  <span className="font-semibold">{issueTime}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="opacity-80">رقم التقرير:</span>
                  <span className="font-semibold">{reportNumber}</span>
                </div>

              </div>

              {/* منتصف: العنوان */}
              <div className="text-center">

                <h1 className="text-2xl font-black mb-1">
                  حديقة الوطن - {selectedCostCenterId
                    ? costCenters?.find(cc => cc.id === selectedCostCenterId)?.name || 'شركة تولان الدولية'
                    : 'شركة تولان الدولية'}
                </h1>

                <h2 className="text-xl font-bold opacity-90">
                  تقرير كشف العمالة اليومية
                </h2>

                <div className="mt-2 inline-block bg-white/20 px-4 py-1 rounded-full text-sm">
                  للفترة من:
                  <span className="font-bold"> {startDate} </span>
                  إلى:
                  <span className="font-bold"> {endDate} </span>
                </div>

              </div>

            </div>

          </div>

          {/* ===== المحتوى ===== */}
          <div className="p-8">
            {isLoading ? (
              <div className="text-center py-20 text-gray-400">جاري تحميل البيانات...</div>
            ) : reportData && reportData.length > 0 ? (
              <>
                <table className="w-full border-collapse border border-gray-200 text-sm mb-8">
                  <thead>
                    <tr className="bg-gray-100 text-blue-900">
                      <th className="border border-gray-300 p-3 text-center w-12">#</th>
                      <th className="border border-gray-300 p-3 text-right">المجموعة</th>
                      <th className="border border-gray-300 p-3 text-center">عدد العمال</th>
                      <th className="border border-gray-300 p-3 text-center">المبلغ</th>
                      <th className="border border-gray-300 p-3 text-center">الخصومات</th>
                      <th className="border border-gray-300 p-3 text-center">الإضافي</th>
                      <th className="border border-gray-300 p-3 text-center bg-blue-50">صافي المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-gray-50 transition-colors">
                        <td className="border border-gray-300 p-3 text-center font-mono">{row.rowIndex}</td>
                        <td className="border border-gray-300 p-3 font-bold">{row.groupName}</td>
                        <td className="border border-gray-300 p-3 text-center">{row.workerCount}</td>
                        <td className="border border-gray-300 p-3 text-center">{formatCurrency(row.totalSalary)}</td>
                        <td className="border border-gray-300 p-3 text-center text-red-600">{formatCurrency(row.totalDeductions)}</td>
                        <td className="border border-gray-300 p-3 text-center text-green-600">{formatCurrency(row.totalBonuses)}</td>
                        <td className="border border-gray-300 p-3 text-center font-black bg-blue-50/50">{formatCurrency(row.totalNet)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>

  <tr
    className={`text-white font-bold ${
      costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
        ? 'bg-[#B92D38]'
        : 'bg-blue-900'
    }`}
  >

    <td
      colSpan={2}
      className={`p-4 text-center text-lg border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'border-[#B92D38]'
          : 'border-blue-900'
      }`}
    >
      الإجمالي
    </td>

    <td
      className={`p-4 text-center text-lg border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'border-[#B92D38]'
          : 'border-blue-900'
      }`}
    >
      {reportData.reduce((s, r) => s + r.workerCount, 0)}
    </td>

    <td
      className={`p-4 text-center text-lg border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'border-[#B92D38]'
          : 'border-blue-900'
      }`}
    >
      {formatCurrency(totalSalary)}
    </td>

    <td
      className={`p-4 text-center text-lg border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'border-[#B92D38]'
          : 'border-blue-900'
      }`}
    >
      {formatCurrency(totalDeductions)}
    </td>

    <td
      className={`p-4 text-center text-lg border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'border-[#B92D38]'
          : 'border-blue-900'
      }`}
    >
      {formatCurrency(totalBonuses)}
    </td>

    <td
      className={`p-4 text-center text-xl border ${
        costCenters?.find(cc => cc.id === selectedCostCenterId)?.code === 'CC06'
          ? 'bg-[#A32631] border-[#A32631]'
          : 'bg-blue-800 border-blue-900'
      }`}
    >
      {formatCurrency(totalNet)}
    </td>

  </tr>
</tfoot>
                </table>

                {/* التفقيط */}
                <div className="bg-blue-50 border-r-4 border-blue-800 p-4 mb-12">
                  <span className="text-blue-800 font-bold ml-2">المبلغ كتابة:</span>
                  <span className="text-lg font-black">{numberToArabicWords(totalNet)}</span>
                </div>

{/* ===== التوقيعات ===== */}
<div className="grid grid-cols-6 gap-3 mt-12 text-center">

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">
      <p className="font-bold text-sm">
        إعداد
      </p>
    </div>

  </div>

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">
      <p className="font-bold text-sm">
        مراجعة أولى
      </p>
    </div>

  </div>

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">
      <p className="font-bold text-sm">
        المراجع المالي
      </p>
    </div>

  </div>

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">
      <p className="font-bold text-sm">
        رئيس الحسابات
      </p>
    </div>

  </div>

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">

      <p className="font-bold text-sm">
        تدقيق ومراجعة
      </p>

      <p className="text-xs mt-1 whitespace-nowrap">
        م. سعد الزكري
      </p>

    </div>

  </div>

  <div className="space-y-3">

    <div className="h-10"></div>

    <div className="border-t border-gray-400 pt-2">

      <p className="font-extrabold text-sm">
        الرئيس التنفيذي
      </p>

      <p className="text-xs font-extrabold mt-1 whitespace-nowrap">
        م. زكري بن عبدالله الزكري
      </p>

    </div>

  </div>

</div>
              </>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد بيانات للفترة المحددة</p>
                <p className="text-sm mt-1">تأكد من وجود دفعات رواتب معتمدة في هذه الفترة</p>
              </div>
            )}
          </div>

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
