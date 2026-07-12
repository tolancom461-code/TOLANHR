import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown } from "lucide-react";

// تفقيط المبالغ بالعربي
function numberToArabicWords(num: number): string {
  if (num === 0) return "صفر ريال";
  
  const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
    "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

  function convertGroup(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      if (o === 0) return tens[t];
      return ones[o] + " و" + tens[t];
    }
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) return hundreds[h];
    return hundreds[h] + " و" + convertGroup(remainder);
  }

  const intPart = Math.floor(Math.abs(num));
  const decPart = Math.round((Math.abs(num) - intPart) * 100);
  
  let result = "فقط ";
  
  if (intPart === 0) {
    result += "صفر";
  } else if (intPart >= 1000000) {
    const millions = Math.floor(intPart / 1000000);
    const remainder = intPart % 1000000;
    if (millions === 1) result += "مليون";
    else if (millions === 2) result += "مليونان";
    else if (millions <= 10) result += convertGroup(millions) + " ملايين";
    else result += convertGroup(millions) + " مليون";
    if (remainder > 0) result += " و" + convertLargeNumber(remainder);
  } else {
    result += convertLargeNumber(intPart);
  }
  
  result += " ريال";
  
  if (decPart > 0) {
    result += " و" + convertGroup(decPart) + " هللة";
  }
  
  return result;

  function convertLargeNumber(n: number): string {
    if (n === 0) return "";
    if (n < 1000) return convertGroup(n);
    
    const thousands = Math.floor(n / 1000);
    const remainder = n % 1000;
    
    let str = "";
    if (thousands === 1) str = "ألف";
    else if (thousands === 2) str = "ألفان";
    else if (thousands <= 10) str = convertGroup(thousands) + " آلاف";
    else str = convertGroup(thousands) + " ألف";
    
    if (remainder > 0) str += " و" + convertGroup(remainder);
    return str;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + " ر.س";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ألوان الرسم البياني الدائري
const CHART_COLORS = [
  '#1e3a5f', '#2d6a4f', '#6b4c9a', '#c44e52', '#d4a843',
  '#3d7ea6', '#8b6914', '#4a7c59', '#7b3f61', '#2c5f7c'
];

// رسم دائري بسيط باستخدام SVG
function PieChart({ data, title }: { data: { name: string; value: number; color: string }[]; title: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;
  
  let currentAngle = 0;
  const size = 180;
  const center = size / 2;
  const radius = 70;

  const slices = data.map((d, i) => {
    const percentage = d.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    // For single item (100%), draw a circle
    if (data.length === 1) {
      return (
        <circle key={i} cx={center} cy={center} r={radius} fill={d.color} />
      );
    }

    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return <path key={i} d={path} fill={d.color} />;
  });

  return (
    <div style={{ textAlign: 'center', display: 'inline-block', margin: '0 20px', verticalAlign: 'top' }}>
      <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px', color: '#1e3a5f' }}>{title}</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices}
      </svg>
      <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '11px' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', justifyContent: 'flex-end' }}>
            <span>{d.name} ({((d.value / total) * 100).toFixed(1)}%)</span>
            <div style={{ width: '12px', height: '12px', backgroundColor: d.color, borderRadius: '2px', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CostCenterReport() {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all");
  const [reportType, setReportType] = useState<"summary" | "detailed">("detailed");
  const [showReport, setShowReport] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const costCentersQuery = trpc.costCenters.list.useQuery();
  
  const reportQuery = trpc.costCenterReport.getData.useQuery(
    {
      periodStart,
      periodEnd,
      costCenterId: selectedCostCenter !== "all" ? parseInt(selectedCostCenter) : undefined,
    },
    { enabled: showReport && !!periodStart && !!periodEnd }
  );

  const handleGenerateReport = () => {
    if (!periodStart || !periodEnd) return;
    setShowReport(true);
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>تقرير مستحقات العمالة التشغيلية</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
            direction: rtl; 
            color: #1a1a1a;
            line-height: 1.6;
            background: white;
          }
          .report-header {
            text-align: center;
            border-bottom: 3px solid #1e3a5f;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .report-header h1 {
            font-size: 20px;
            color: #1e3a5f;
            margin-bottom: 5px;
            font-weight: 700;
          }
          .report-header .company-name {
            font-size: 14px;
            color: #555;
            margin-bottom: 8px;
          }
          .report-header .period {
            font-size: 13px;
            color: #333;
            background: #f0f4f8;
            display: inline-block;
            padding: 4px 16px;
            border-radius: 4px;
          }
          .report-header .print-date {
            font-size: 11px;
            color: #888;
            margin-top: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 13px;
          }
          th {
            background: #1e3a5f;
            color: white;
            padding: 10px 12px;
            text-align: right;
            font-weight: 600;
            font-size: 12px;
          }
          td {
            padding: 8px 12px;
            border-bottom: 1px solid #e0e0e0;
            text-align: right;
          }
          .cost-center-row {
            background: #f0f4f8;
            font-weight: 700;
            color: #1e3a5f;
            font-size: 14px;
          }
          .cost-center-row td {
            border-bottom: 2px solid #1e3a5f;
            padding: 10px 12px;
          }
          .group-row td {
            padding-right: 30px;
          }
          .subtotal-row {
            background: #f8f9fa;
            font-weight: 600;
            color: #2d6a4f;
          }
          .subtotal-row td {
            border-top: 1px solid #2d6a4f;
            border-bottom: 2px solid #2d6a4f;
          }
          .grand-total-row {
            background: #1e3a5f;
            color: white;
            font-weight: 700;
            font-size: 14px;
          }
          .grand-total-row td {
            padding: 12px;
            border: none;
          }
          .amount-words {
            margin-top: 10px;
            padding: 10px 15px;
            background: #faf8f0;
            border: 1px solid #d4a843;
            border-radius: 6px;
            font-size: 13px;
            color: #5a4a1e;
            font-weight: 600;
            text-align: center;
          }
          .charts-section {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
          }
          .charts-section h3 {
            font-size: 15px;
            color: #1e3a5f;
            margin-bottom: 15px;
          }
          .chart-container {
            display: inline-block;
            margin: 0 15px;
            vertical-align: top;
          }
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #ccc;
            text-align: center;
            font-size: 10px;
            color: #999;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const reportData = reportQuery.data;
  const selectedCCName = selectedCostCenter === "all" 
    ? "جميع مراكز التكلفة" 
    : costCentersQuery.data?.find((cc: any) => cc.id === parseInt(selectedCostCenter))?.name || "";

  const reportTitle = `تقرير مستحقات العمالة التشغيلية - ${selectedCCName}`;
  const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-800">تقرير مستحقات العمالة التشغيلية</h1>
      
      {/* فلاتر التقرير */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">إعدادات التقرير</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">من تاريخ</label>
              <Input 
                type="date" 
                value={periodStart} 
                onChange={(e) => { setPeriodStart(e.target.value); setShowReport(false); }} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">إلى تاريخ</label>
              <Input 
                type="date" 
                value={periodEnd} 
                onChange={(e) => { setPeriodEnd(e.target.value); setShowReport(false); }} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">مركز التكلفة</label>
              <Select value={selectedCostCenter} onValueChange={(v) => { setSelectedCostCenter(v); setShowReport(false); }}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المراكز</SelectItem>
                  {costCentersQuery.data?.map((cc: any) => (
                    <SelectItem key={cc.id} value={String(cc.id)}>{cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">نوع التقرير</label>
              <Select value={reportType} onValueChange={(v: any) => { setReportType(v); setShowReport(false); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="detailed">تفصيلي بالمجموعات</SelectItem>
                  <SelectItem value="summary">إجمالي المراكز</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleGenerateReport} disabled={!periodStart || !periodEnd}>
              عرض التقرير
            </Button>
            {showReport && reportData && (
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 ml-2" />
                طباعة
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* عرض التقرير */}
      {showReport && reportQuery.isLoading && (
        <Card><CardContent className="p-8 text-center">جاري تحميل التقرير...</CardContent></Card>
      )}

      {showReport && reportData && (
        <Card>
          <CardContent className="p-6">
            {/* محتوى قابل للطباعة */}
            <div ref={printRef}>
              {/* رأس التقرير */}
              <div className="report-header" style={{ textAlign: 'center', borderBottom: '3px solid #1e3a5f', paddingBottom: '15px', marginBottom: '20px' }}>
                <div className="company-name" style={{ fontSize: '14px', color: '#555', marginBottom: '8px' }}>تولان لإدارة القوى العاملة</div>
                <h1 style={{ fontSize: '20px', color: '#1e3a5f', marginBottom: '8px', fontWeight: 700 }}>{reportTitle}</h1>
                <div className="period" style={{ fontSize: '13px', color: '#333', background: '#f0f4f8', display: 'inline-block', padding: '4px 16px', borderRadius: '4px' }}>
                  الفترة: من {formatDate(periodStart)} إلى {formatDate(periodEnd)}
                </div>
                <div className="print-date" style={{ fontSize: '11px', color: '#888', marginTop: '5px' }}>
                  تاريخ الطباعة: {today}
                </div>
              </div>

              {/* الجدول */}
              {reportType === "summary" ? (
                /* الخيار المختصر - إجمالي المراكز */
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>#</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>مركز التكلفة</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>عدد العمال</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>صافي المستحق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.costCenters.map((cc, idx) => (
                        <tr key={cc.costCenterId}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', fontWeight: 600 }}>{cc.costCenterName}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{cc.totalWorkers}</td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{formatCurrency(cc.totalNetAmount)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#1e3a5f', color: 'white', fontWeight: 700, fontSize: '14px' }}>
                        <td style={{ padding: '12px', border: 'none' }} colSpan={2}>الإجمالي الكلي</td>
                        <td style={{ padding: '12px', border: 'none' }}>{reportData.grandTotal.workerCount}</td>
                        <td style={{ padding: '12px', border: 'none' }}>{formatCurrency(reportData.grandTotal.netAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: '10px', padding: '10px 15px', background: '#faf8f0', border: '1px solid #d4a843', borderRadius: '6px', fontSize: '13px', color: '#5a4a1e', fontWeight: 600, textAlign: 'center' }}>
                    {numberToArabicWords(reportData.grandTotal.netAmount)}
                  </div>
                </>
              ) : (
                /* الخيار التفصيلي - بالمجموعات */
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', fontSize: '13px' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>#</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>مركز التكلفة / المجموعة</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>عدد العمال</th>
                        <th style={{ background: '#1e3a5f', color: 'white', padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>صافي المستحق</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.costCenters.map((cc, ccIdx) => (
                        <>
                          {/* صف مركز التكلفة */}
                          <tr key={`cc-${cc.costCenterId}`} style={{ background: '#f0f4f8', fontWeight: 700, color: '#1e3a5f', fontSize: '14px' }}>
                            <td style={{ padding: '10px 12px', borderBottom: '2px solid #1e3a5f' }}></td>
                            <td style={{ padding: '10px 12px', borderBottom: '2px solid #1e3a5f' }}>{cc.costCenterName}</td>
                            <td style={{ padding: '10px 12px', borderBottom: '2px solid #1e3a5f' }}></td>
                            <td style={{ padding: '10px 12px', borderBottom: '2px solid #1e3a5f' }}></td>
                          </tr>
                          {/* صفوف المجموعات */}
                          {cc.groups.map((grp, grpIdx) => (
                            <tr key={`grp-${cc.costCenterId}-${grp.groupId}`}>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', paddingRight: '30px' }}>{grpIdx + 1}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', paddingRight: '30px' }}>{grp.groupName}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{grp.workerCount}</td>
                              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0' }}>{formatCurrency(grp.netAmount)}</td>
                            </tr>
                          ))}
                          {/* صف إجمالي المركز */}
                          <tr key={`sub-${cc.costCenterId}`} style={{ background: '#f8f9fa', fontWeight: 600, color: '#2d6a4f' }}>
                            <td style={{ padding: '8px 12px', borderTop: '1px solid #2d6a4f', borderBottom: '2px solid #2d6a4f' }}></td>
                            <td style={{ padding: '8px 12px', borderTop: '1px solid #2d6a4f', borderBottom: '2px solid #2d6a4f' }}>إجمالي {cc.costCenterName}</td>
                            <td style={{ padding: '8px 12px', borderTop: '1px solid #2d6a4f', borderBottom: '2px solid #2d6a4f' }}>{cc.totalWorkers}</td>
                            <td style={{ padding: '8px 12px', borderTop: '1px solid #2d6a4f', borderBottom: '2px solid #2d6a4f' }}>{formatCurrency(cc.totalNetAmount)}</td>
                          </tr>
                          {/* تفقيط إجمالي المركز */}
                          <tr key={`words-${cc.costCenterId}`}>
                            <td colSpan={4} style={{ padding: '8px 15px', background: '#faf8f0', border: '1px solid #d4a843', fontSize: '12px', color: '#5a4a1e', fontWeight: 600, textAlign: 'center' }}>
                              {numberToArabicWords(cc.totalNetAmount)}
                            </td>
                          </tr>
                          {/* مسافة بين المراكز */}
                          <tr key={`spacer-${cc.costCenterId}`}><td colSpan={4} style={{ padding: '5px' }}></td></tr>
                        </>
                      ))}
                      {/* الإجمالي الكلي */}
                      <tr style={{ background: '#1e3a5f', color: 'white', fontWeight: 700, fontSize: '14px' }}>
                        <td style={{ padding: '12px', border: 'none' }}></td>
                        <td style={{ padding: '12px', border: 'none' }}>الإجمالي الكلي</td>
                        <td style={{ padding: '12px', border: 'none' }}>{reportData.grandTotal.workerCount}</td>
                        <td style={{ padding: '12px', border: 'none' }}>{formatCurrency(reportData.grandTotal.netAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: '10px', padding: '10px 15px', background: '#faf8f0', border: '1px solid #d4a843', borderRadius: '6px', fontSize: '13px', color: '#5a4a1e', fontWeight: 600, textAlign: 'center' }}>
                    {numberToArabicWords(reportData.grandTotal.netAmount)}
                  </div>
                </>
              )}

              {/* الرسوم البيانية الدائرية */}
              {reportData.costCenters.length > 0 && (
                <div className="charts-section" style={{ marginTop: '25px', paddingTop: '15px', borderTop: '1px solid #e0e0e0', textAlign: 'center' }}>
                  {reportData.costCenters.map((cc, ccIdx) => {
                    if (cc.groups.length === 0) return null;
                    const chartData = cc.groups.map((grp, i) => ({
                      name: grp.groupName,
                      value: grp.netAmount,
                      color: CHART_COLORS[i % CHART_COLORS.length],
                    }));
                    return (
                      <PieChart 
                        key={cc.costCenterId} 
                        data={chartData} 
                        title={`توزيع المستحقات - ${cc.costCenterName}`} 
                      />
                    );
                  })}
                </div>
              )}

              {/* التذييل */}
              <div className="footer" style={{ marginTop: '30px', paddingTop: '10px', borderTop: '1px solid #ccc', textAlign: 'center', fontSize: '10px', color: '#999' }}>
                صفحة 1 من 1
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showReport && reportData && reportData.costCenters.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            لا توجد دفعات رواتب معتمدة في الفترة المحددة
          </CardContent>
        </Card>
      )}
    </div>
  );
}
