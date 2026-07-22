import puppeteer from "puppeteer";
import { getDailyPayrollReport } from "./dailyPayrollReport";
import * as db from "./db";

// ============================================
// أدوات تنسيق (نسخة خادم مطابقة لنسخة العميل)
// ============================================

function numberToArabicWords(num: number): string {
  if (num === 0) return "صفر ريال سعودي";

  const ones = [
    "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
    "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر",
    "سبعة عشر", "ثمانية عشر", "تسعة عشر",
  ];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = [
    "", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة",
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

  let result = chunks.join(" و");
  result += " ريال سعودي";
  if (decPart > 0) {
    result += ` و${convertBelow1000(decPart)} هللة`;
  }
  result += " فقط لا غير";
  return result.trim();
}

function formatCurrency(amount: number): string {
  return (
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " ر.س"
  );
}

function formatCurrencyNet(amount: number): string {
  const numberPart = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${numberPart} <span class="sar-small">ر.س</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================
// بناء HTML التقرير (CSS خام، بدون أي اعتماد على Tailwind)
// ============================================

interface BuildHtmlParams {
  rows: Awaited<ReturnType<typeof getDailyPayrollReport>>;
  companyName: string;
  isRed: boolean; // true إذا كان مركز التكلفة CC06
  periodStart: string;
  periodEnd: string;
}

function buildReportHtml({ rows, companyName, isRed, periodStart, periodEnd }: BuildHtmlParams): string {
  const now = new Date();
  const issueDate = now.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  const issueTime = now.toLocaleTimeString("ar-SA");

  const totalSalary = rows.reduce((s, r) => s + r.totalSalary, 0);
  const totalDeductions = rows.reduce((s, r) => s + r.totalDeductions, 0);
  const totalBonuses = rows.reduce((s, r) => s + r.totalBonuses, 0);
  const totalNet = rows.reduce((s, r) => s + r.totalNet, 0);
  const totalWorkers = rows.reduce((s, r) => s + r.workerCount, 0);

  const mainColor = isRed ? "#B92D38" : "#1e40af"; // blue-800 fallback
  const darkColor = isRed ? "#A32631" : "#1e3a8a"; // blue-900 fallback

  const bodyRows = rows
    .map(
      (row) => `
      <tr>
        <td class="c center mono">${row.rowIndex}</td>
        <td class="c bold">${escapeHtml(row.groupName)}</td>
        <td class="c center">${row.workerCount}</td>
        <td class="c center">${formatCurrency(row.totalSalary)}</td>
        <td class="c center red">${formatCurrency(row.totalDeductions)}</td>
        <td class="c center green">${formatCurrency(row.totalBonuses)}</td>
        <td class="c center black net-cell">${formatCurrencyNet(row.totalNet)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Arial", "Tahoma", sans-serif;
    margin: 0;
    padding: 0;
    color: #1f2937;
    background: #ffffff;
  }
  .header {
    background: ${mainColor};
    color: #ffffff;
    padding: 14.688px;
    border-radius: 12px 12px 0 0;
    position: relative;
    text-align: center;
  }
  .header .meta-box {
    position: absolute;
    top: 24px;
    right: 24px;
    background: rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    min-width: 200px;
    text-align: right;
  }
  .header .meta-box div { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px; }
  .header .meta-box span.label { opacity: 0.8; }
  .header h1 { font-size: 22px; font-weight: 900; margin: 0 0 4px; }
  .header h2 { font-size: 18px; font-weight: 700; margin: 0; opacity: 0.9; }
  .header .period {
    display: inline-block;
    margin-top: 10px;
    background: rgba(255,255,255,0.2);
    padding: 4px 16px;
    border-radius: 999px;
    font-size: 13px;
  }
  .content { padding: 16.524px 24px 18.36px 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 14.688px; table-layout: fixed; }
  col.n1 { width: 5%; } col.n2 { width: 27%; } col.n3 { width: 12%; }
  col.n4 { width: 14%; } col.n5 { width: 14%; } col.n6 { width: 14%; } col.n7 { width: 14%; }
  thead tr { background: #f3f4f6; color: #1e3a8a; }
  th, td.c { border: 1px solid #d1d5db; }
  th { padding: 8.64px 12px; text-align: center; }
  tbody td.c { padding: 5.8752px 12px; }
  th.right { text-align: right; }
  th.net-head { background: #eff6ff; }
  .net-cell { background: rgba(239,246,255,0.5); font-weight: 900; }
  .sar-small { font-size: 50%; }
  td.center { text-align: center; }
  td.bold { font-weight: 700; }
  td.mono { font-family: "Courier New", monospace; }
  td.red { color: #dc2626; }
  td.green { color: #16a34a; }
  td.black { font-weight: 900; }
  tfoot td {
    background: ${darkColor};
    color: #ffffff;
    font-weight: 700;
    border: 1px solid ${darkColor};
    padding: 7.8336px 16px;
    text-align: center;
    font-size: 16px;
  }
  tfoot td.net-total { background: ${mainColor}; font-size: 18px; }
  .amount-words {
    background: #eff6ff;
    border-right: 4px solid ${mainColor};
    padding: 12.24px;
    margin-bottom: 12.852px;
    font-size: 15px;
  }
  .amount-words .label { color: ${mainColor}; font-weight: 700; margin-left: 8px; }
  .amount-words .value { font-weight: 900; }
  .signatures { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-top: 15.12px; text-align: center; }
  .signatures .slot { padding-bottom: 9px; border-bottom: 1px solid #9ca3af; }
  .signatures .role { font-weight: 700; font-size: 13px; margin: 0; }
  .signatures .role.exec { font-weight: 900; }
  .signatures .name { font-size: 11px; margin-top: 4px; white-space: nowrap; }
  @page { size: A4 landscape; margin: 1cm; }
</style>
</head>
<body>
  <div class="header">
    <div class="meta-box">
      <div><span class="label">تاريخ الإصدار:</span><span>${issueDate}</span></div>
      <div><span class="label">وقت الإصدار:</span><span>${issueTime}</span></div>
    </div>
    <h1>حديقة الوطن - ${escapeHtml(companyName)}</h1>
    <h2>تقرير كشف العمالة اليومية</h2>
    <div class="period">للفترة من: <strong>${periodStart}</strong> إلى: <strong>${periodEnd}</strong></div>
  </div>
  <div class="content">
    ${
      rows.length > 0
        ? `
    <table>
      <colgroup>
        <col class="n1" /><col class="n2" /><col class="n3" /><col class="n4" /><col class="n5" /><col class="n6" /><col class="n7" />
      </colgroup>
      <thead>
        <tr>
          <th>#</th>
          <th class="right">المجموعة</th>
          <th>عدد العمال</th>
          <th>المبلغ</th>
          <th>الخصومات</th>
          <th>الإضافي</th>
          <th class="net-head">صافي المبلغ</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2">الإجمالي</td>
          <td>${totalWorkers}</td>
          <td>${formatCurrency(totalSalary)}</td>
          <td>${formatCurrency(totalDeductions)}</td>
          <td>${formatCurrency(totalBonuses)}</td>
          <td class="net-total">${formatCurrencyNet(totalNet)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="amount-words">
      <span class="label">المبلغ كتابة:</span>
      <span class="value">${numberToArabicWords(totalNet)}</span>
    </div>
    <div class="signatures">
      <div class="slot"><p class="role">إعداد</p></div>
      <div class="slot"><p class="role">مراجعة أولى</p></div>
      <div class="slot"><p class="role">المراجع المالي</p></div>
      <div class="slot"><p class="role">رئيس الحسابات</p></div>
      <div class="slot"><p class="role">تدقيق ومراجعة</p><p class="name">م. سعد الزكري</p></div>
      <div class="slot"><p class="role exec">الرئيس التنفيذي</p><p class="name">م. زكري بن عبدالله الزكري</p></div>
    </div>`
        : `<div style="text-align:center; padding: 60px 0; color:#9ca3af;">لا توجد بيانات للفترة المحددة</div>`
    }
  </div>
</body>
</html>`;
}

// ============================================
// توليد ملف PDF عبر Puppeteer
// ============================================

export async function generateDailyPayrollReportPdf(input: {
  periodStart: string;
  periodEnd: string;
  costCenterId?: number;
  groupIds?: number[];
}): Promise<Buffer> {
  const [rows, costCenters] = await Promise.all([
    getDailyPayrollReport(input.periodStart, input.periodEnd, input.costCenterId, input.groupIds),
    db.getAllCostCenters(),
  ]);

  const selectedCostCenter = input.costCenterId
    ? costCenters.find((cc: any) => cc.id === input.costCenterId)
    : undefined;

  const companyName = selectedCostCenter?.name || "شركة تولان الدولية";
  const isRed = selectedCostCenter?.code === "CC06";

  const html = buildReportHtml({
    rows,
    companyName,
    isRed,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
