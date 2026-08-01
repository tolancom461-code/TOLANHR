import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { FileText, FileCheck } from "lucide-react";
import {
  CEO_REPORT_TITLE,
  createCeoReportSections,
  type CeoReportSection,
  type CeoShiftCategory,
} from "@shared/ceoReportsAggregation";

function numberToArabicWords(num: number): string {
  if (num === 0) return "صفر ريال سعودي";

  const ones = [
    "",
    "واحد",
    "اثنان",
    "ثلاثة",
    "أربعة",
    "خمسة",
    "ستة",
    "سبعة",
    "ثمانية",
    "تسعة",
    "عشرة",
    "أحد عشر",
    "اثنا عشر",
    "ثلاثة عشر",
    "أربعة عشر",
    "خمسة عشر",
    "ستة عشر",
    "سبعة عشر",
    "ثمانية عشر",
    "تسعة عشر",
  ];
  const tens = [
    "",
    "",
    "عشرون",
    "ثلاثون",
    "أربعون",
    "خمسون",
    "ستون",
    "سبعون",
    "ثمانون",
    "تسعون",
  ];
  const hundreds = [
    "",
    "مائة",
    "مئتان",
    "ثلاثمائة",
    "أربعمائة",
    "خمسمائة",
    "ستمائة",
    "سبعمائة",
    "ثمانمائة",
    "تسعمائة",
  ];

  function convertBelow1000(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return one === 0 ? tens[ten] : `${ones[one]} و${tens[ten]}`;
    }
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0
      ? hundreds[h]
      : `${hundreds[h]} و${convertBelow1000(rest)}`;
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

  let result = `${chunks.join(" و")} ريال سعودي`;
  if (decPart > 0) result += ` و${convertBelow1000(decPart)} هللة`;
  return `${result} فقط لا غير`.trim();
}

function formatCurrency(amount: number): string {
  return (
    new Intl.NumberFormat("ar-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " ر.س"
  );
}

function ReportSectionPreview({
  section,
  startDate,
  endDate,
  issueDate,
  issueTime,
}: {
  section: CeoReportSection;
  startDate: string;
  endDate: string;
  issueDate: string;
  issueTime: string;
}) {
  const isRed = section.costCenterCode === "CC06";
  const totalNet = section.rows.reduce((sum, row) => sum + row.totalNet, 0);

  return (
    <section className="ceo-report-page overflow-hidden rounded-xl bg-white shadow-lg">
      <div
        className={`report-header p-6 text-white ${
          isRed ? "bg-[#B92D38]" : "bg-blue-800"
        }`}
      >
        <div className="relative flex items-start justify-center">
          <div className="absolute right-0 min-w-[220px] space-y-1 rounded-lg bg-white/10 p-3 text-sm backdrop-blur-sm">
            <div className="flex justify-between gap-4">
              <span className="opacity-80">تاريخ الإصدار:</span>
              <span className="font-semibold">{issueDate}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="opacity-80">وقت الإصدار:</span>
              <span className="font-semibold">{issueTime}</span>
            </div>
          </div>

          <div className="text-center">
            <h1 className="mb-1 text-2xl font-black">
              حديقة الوطن - {section.costCenterName}
            </h1>
            <h2 className="text-xl font-bold opacity-90">{section.title}</h2>
            <div className="mt-2 inline-block rounded-full bg-white/20 px-4 py-1 text-sm">
              للفترة من:
              <span className="font-bold"> {startDate} </span>
              إلى:
              <span className="font-bold"> {endDate} </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-8">
        {section.rows.length > 0 ? (
          <>
            <table className="mb-8 w-full table-fixed border-collapse border border-gray-200 text-sm">
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "55%" }} />
                <col style={{ width: "37%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 text-blue-900">
                  <th className="border border-gray-300 px-3 py-[0.6rem] text-center">
                    #
                  </th>
                  <th className="border border-gray-300 px-3 py-[0.6rem] text-right">
                    التصنيف
                  </th>
                  <th className="border border-gray-300 bg-blue-50 px-3 py-[0.6rem] text-center">
                    صافي المبلغ
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr
                    key={row.category}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="border border-gray-300 px-3 py-[0.6rem] text-center font-mono">
                      {index + 1}
                    </td>
                    <td className="border border-gray-300 px-3 py-[0.6rem] font-bold">
                      {row.label}
                    </td>
                    <td className="border border-gray-300 bg-blue-50/50 px-3 py-[0.6rem] text-center font-black">
                      {formatCurrency(row.totalNet)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className={`font-bold text-white ${isRed ? "bg-[#B92D38]" : "bg-blue-900"}`}
                >
                  <td
                    colSpan={2}
                    className={`border px-4 py-[0.8rem] text-center text-lg ${
                      isRed ? "border-[#B92D38]" : "border-blue-900"
                    }`}
                  >
                    الإجمالي
                  </td>
                  <td
                    className={`border px-4 py-[0.8rem] text-center text-xl ${
                      isRed
                        ? "border-[#A32631] bg-[#A32631]"
                        : "border-blue-900 bg-blue-800"
                    }`}
                  >
                    {formatCurrency(totalNet)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="mb-6 border-r-4 border-blue-800 bg-blue-50 p-4">
              <span className="ml-2 font-bold text-blue-800">
                المبلغ كتابة:
              </span>
              <span className="text-lg font-black">
                {numberToArabicWords(totalNet)}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-6 gap-3 text-center">
              <div className="flex h-full flex-col justify-between">
                <p className="text-sm font-bold">إعداد</p>
                <div className="h-10 border-b border-gray-400" />
              </div>
              <div className="flex h-full flex-col justify-between">
                <p className="text-sm font-bold">مراجعة أولى</p>
                <div className="h-10 border-b border-gray-400" />
              </div>
              <div className="flex h-full flex-col justify-between">
                <p className="text-sm font-bold">المراجع المالي</p>
                <div className="h-10 border-b border-gray-400" />
              </div>
              <div className="flex h-full flex-col justify-between">
                <p className="text-sm font-bold">رئيس الحسابات</p>
                <div className="h-10 border-b border-gray-400" />
              </div>
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-sm font-bold">تدقيق ومراجعة</p>
                  <p className="mt-1 whitespace-nowrap text-xs">
                    م. سعد الزكري
                  </p>
                </div>
                <div className="h-10 border-b border-gray-400" />
              </div>
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-sm font-extrabold">الرئيس التنفيذي</p>
                  <p className="mt-1 whitespace-nowrap text-xs font-extrabold">
                    م. زكري بن عبدالله الزكري
                  </p>
                </div>
                <div className="h-10 border-b border-gray-400" />
              </div>
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-gray-400">
            <FileText className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>لا توجد بيانات مصنفة للفترة المحددة</p>
            <p className="mt-1 text-sm">
              المجموعات غير المحددة ضمن الصباحي أو المسائي يتم تجاهلها
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function CeoReports() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(
    firstDay.toLocaleDateString("en-CA")
  );
  const [endDate, setEndDate] = useState(today.toLocaleDateString("en-CA"));
  const [reportTitle, setReportTitle] = useState(CEO_REPORT_TITLE);
  const [costCenterSelection, setCostCenterSelection] = useState("all");
  const [shiftSelection, setShiftSelection] = useState<
    "morning" | "evening" | "both"
  >("both");
  const [mergeShifts, setMergeShifts] = useState(true);
  const [morningGroupIds, setMorningGroupIds] = useState<number[]>([]);
  const [eveningGroupIds, setEveningGroupIds] = useState<number[]>([]);
  const [queryEnabled, setQueryEnabled] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const issueTime = today.toLocaleTimeString("ar-SA");
  const issueDate = today.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const selectedCostCenterIds = useMemo(() => {
    if (!costCenters) return [];
    if (costCenterSelection === "all")
      return costCenters.map(costCenter => costCenter.id);
    const selectedId = Number(costCenterSelection);
    return costCenters.some(costCenter => costCenter.id === selectedId)
      ? [selectedId]
      : [];
  }, [costCenters, costCenterSelection]);
  const selectedCostCenters = useMemo(() => {
    const selectedIdSet = new Set(selectedCostCenterIds);
    return (costCenters ?? []).filter(costCenter =>
      selectedIdSet.has(costCenter.id)
    );
  }, [costCenters, selectedCostCenterIds]);
  const selectedShifts = useMemo<CeoShiftCategory[]>(
    () =>
      shiftSelection === "both" ? ["morning", "evening"] : [shiftSelection],
    [shiftSelection]
  );

  const { data: groups } = trpc.ceoReports.getGroups.useQuery(
    { costCenterIds: selectedCostCenterIds },
    { enabled: selectedCostCenterIds.length > 0 }
  );
  const { data: reportData, isLoading } = trpc.ceoReports.getReport.useQuery(
    {
      periodStart: startDate,
      periodEnd: endDate,
      costCenterIds: selectedCostCenterIds,
    },
    { enabled: queryEnabled && selectedCostCenterIds.length > 0 }
  );
  const reportSections = useMemo(
    () =>
      createCeoReportSections({
        rows: reportData ?? [],
        costCenters: selectedCostCenters,
        morningGroupIds,
        eveningGroupIds,
        selectedShifts,
        mergeShifts,
        reportTitle,
      }),
    [
      reportData,
      selectedCostCenters,
      morningGroupIds,
      eveningGroupIds,
      selectedShifts,
      mergeShifts,
      reportTitle,
    ]
  );

  const toggleGroup = (category: CeoShiftCategory, id: number) => {
    if (category === "morning") {
      setMorningGroupIds(previous =>
        previous.includes(id)
          ? previous.filter(groupId => groupId !== id)
          : [...previous, id]
      );
      setEveningGroupIds(previous =>
        previous.filter(groupId => groupId !== id)
      );
      return;
    }

    setEveningGroupIds(previous =>
      previous.includes(id)
        ? previous.filter(groupId => groupId !== id)
        : [...previous, id]
    );
    setMorningGroupIds(previous => previous.filter(groupId => groupId !== id));
  };

  const selectAllGroups = (
    category: CeoShiftCategory,
    costCenterGroupIds: number[]
  ) => {
    const groupIdSet = new Set(costCenterGroupIds);
    if (category === "morning") {
      setMorningGroupIds(previous => [
        ...previous.filter(id => !groupIdSet.has(id)),
        ...costCenterGroupIds,
      ]);
      setEveningGroupIds(previous =>
        previous.filter(id => !groupIdSet.has(id))
      );
      return;
    }

    setEveningGroupIds(previous => [
      ...previous.filter(id => !groupIdSet.has(id)),
      ...costCenterGroupIds,
    ]);
    setMorningGroupIds(previous => previous.filter(id => !groupIdSet.has(id)));
  };

  const deselectAllGroups = (
    category: CeoShiftCategory,
    costCenterGroupIds: number[]
  ) => {
    const groupIdSet = new Set(costCenterGroupIds);
    if (category === "morning") {
      setMorningGroupIds(previous =>
        previous.filter(id => !groupIdSet.has(id))
      );
    } else {
      setEveningGroupIds(previous =>
        previous.filter(id => !groupIdSet.has(id))
      );
    }
  };

  const handleCostCenterChange = (value: string) => {
    setCostCenterSelection(value);
    setMorningGroupIds([]);
    setEveningGroupIds([]);
    setQueryEnabled(false);
  };

  const exportPdfMutation = trpc.ceoReports.exportPdf.useMutation();
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const result = await exportPdfMutation.mutateAsync({
        periodStart: startDate,
        periodEnd: endDate,
        costCenterIds: selectedCostCenterIds,
        morningGroupIds,
        eveningGroupIds,
        selectedShifts,
        mergeShifts,
        reportTitle: reportTitle.trim() || CEO_REPORT_TITLE,
      });
      const byteChars = atob(result.data);
      const byteNumbers = new Array(byteChars.length);
      for (let index = 0; index < byteChars.length; index += 1) {
        byteNumbers[index] = byteChars.charCodeAt(index);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
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

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-4">
      <div className="no-print mb-6 rounded-xl border border-blue-100 bg-white p-6 shadow">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-blue-800">
          <FileText className="h-5 w-5" />
          إعدادات التقرير
        </h2>

        <div className="mb-4 space-y-1">
          <Label>عنوان التقرير</Label>
          <Input
            value={reportTitle}
            maxLength={200}
            onChange={event => setReportTitle(event.target.value)}
            placeholder={CEO_REPORT_TITLE}
          />
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label>من تاريخ</Label>
            <Input
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>إلى تاريخ</Label>
            <Input
              type="date"
              value={endDate}
              onChange={event => setEndDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>مركز التكلفة</Label>
            <Select
              value={costCenterSelection}
              onValueChange={handleCostCenterChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر مركز التكلفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {costCenters?.length === 2 ? "كلاهما" : "جميع مراكز التكلفة"}
                </SelectItem>
                {costCenters?.map(costCenter => (
                  <SelectItem
                    key={costCenter.id}
                    value={costCenter.id.toString()}
                  >
                    {costCenter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>فترة التشغيل</Label>
            <Select
              value={shiftSelection}
              onValueChange={value =>
                setShiftSelection(value as "morning" | "evening" | "both")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">صباحي</SelectItem>
                <SelectItem value="evening">مسائي</SelectItem>
                <SelectItem value="both">صباحي ومسائي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full bg-blue-700 text-white hover:bg-blue-800"
              disabled={selectedCostCenterIds.length === 0}
              onClick={() => setQueryEnabled(true)}
            >
              عرض التقرير
            </Button>
          </div>
        </div>

        {shiftSelection === "both" && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <Switch
              id="merge-shifts"
              checked={mergeShifts}
              onCheckedChange={setMergeShifts}
            />
            <Label htmlFor="merge-shifts" className="cursor-pointer">
              دمج فترتي التشغيل في صفحة واحدة لكل مركز تكلفة
            </Label>
          </div>
        )}

        <p className="mb-4 text-sm text-gray-500">
          المجموعات التي لا تُحدَّد ضمن التشغيل الصباحي أو المسائي يتم تجاهلها
          ولا تظهر في التقرير.
        </p>

        <div className="space-y-4">
          {selectedCostCenters.map(costCenter => {
            const costCenterGroups = (groups ?? []).filter(
              group => group.costCenterId === costCenter.id
            );
            const costCenterGroupIds = costCenterGroups.map(group => group.id);

            if (costCenterGroups.length === 0) return null;

            return (
              <div
                key={costCenter.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <h3 className="mb-3 font-bold text-gray-800">
                  مركز تكلفة {costCenter.name}
                </h3>
                <div
                  className={`grid grid-cols-1 gap-4 ${
                    shiftSelection === "both" ? "md:grid-cols-2" : ""
                  }`}
                >
                  {selectedShifts.map(category => {
                    const isMorning = category === "morning";
                    const selectedGroupIds = isMorning
                      ? morningGroupIds
                      : eveningGroupIds;

                    return (
                      <div
                        key={category}
                        className={`rounded-lg border p-4 ${
                          isMorning
                            ? "border-amber-200 bg-amber-50"
                            : "border-indigo-200 bg-indigo-50"
                        }`}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            className={`text-sm font-semibold ${
                              isMorning ? "text-amber-800" : "text-indigo-800"
                            }`}
                          >
                            مجموعات التشغيل {isMorning ? "الصباحي" : "المسائي"}:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              selectAllGroups(category, costCenterGroupIds)
                            }
                            className={`text-xs hover:underline ${
                              isMorning ? "text-amber-700" : "text-indigo-700"
                            }`}
                          >
                            تحديد الكل
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              deselectAllGroups(category, costCenterGroupIds)
                            }
                            className="text-xs text-red-500 hover:underline"
                          >
                            إلغاء الكل
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {costCenterGroups.map(group => (
                            <label
                              key={group.id}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={selectedGroupIds.includes(group.id)}
                                onCheckedChange={() =>
                                  toggleGroup(category, group.id)
                                }
                              />
                              <span>{group.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {queryEnabled && !isLoading && reportSections.length > 0 && (
        <div className="no-print mb-4 flex justify-end gap-3">
          <Button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-2 bg-blue-700 text-white hover:bg-blue-800"
          >
            <FileCheck className="h-4 w-4" />
            {isExportingPdf ? "جاري إنشاء الملف..." : "تنزيل PDF رسمي"}
          </Button>
        </div>
      )}

      {queryEnabled &&
        (isLoading ? (
          <div className="rounded-xl bg-white py-20 text-center text-gray-400 shadow-lg">
            جاري تحميل البيانات...
          </div>
        ) : (
          <div id="print-report" className="space-y-6">
            {reportSections.map(section => (
              <ReportSectionPreview
                key={section.key}
                section={section}
                startDate={startDate}
                endDate={endDate}
                issueDate={issueDate}
                issueTime={issueTime}
              />
            ))}
          </div>
        ))}

      <style>{`
        .ceo-report-page {
          break-after: page;
          page-break-after: always;
        }
        .ceo-report-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        @media print {
          body * { visibility: hidden; }
          #print-report, #print-report * { visibility: visible; }
          #print-report {
            position: absolute;
            top: 0;
            right: 0;
            left: 0;
            width: 100%;
          }
          .ceo-report-page {
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
