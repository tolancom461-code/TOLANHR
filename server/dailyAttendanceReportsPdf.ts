import puppeteer from "puppeteer";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDailyAttendanceReportData } from "./dailyAttendanceReports";
import { groupDailyAttendanceRows, computeDailyAttendanceGrandTotals } from "../shared/dailyAttendanceReportGrouping";

let cachedArabicFontCss: string | undefined;

function getArabicFontCss(): string {
  if (cachedArabicFontCss !== undefined) return cachedArabicFontCss;

  const fontPath = [
    resolve(process.cwd(), "server/fonts/NotoSansArabic-Regular.ttf"),
    resolve(process.cwd(), "dist/fonts/NotoSansArabic-Regular.ttf"),
  ].find(existsSync);

  if (!fontPath) {
    cachedArabicFontCss = "";
    return cachedArabicFontCss;
  }

  const fontBase64 = readFileSync(fontPath).toString("base64");
  cachedArabicFontCss = `
    @font-face {
      font-family: "Noto Sans Arabic Embedded";
      src: url("data:font/ttf;base64,${fontBase64}") format("truetype");
      font-style: normal;
      font-weight: 100 900;
      font-display: block;
    }
  `;
  return cachedArabicFontCss;
}

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================
// بناء HTML التقرير — نفس تصميم كشف الدفعة الفردية بالضبط،
// فقط بدون "رمز الدفعة" و"الحالة" بالرأس (لأن الفلترة قد تشمل أكثر من دفعة).
// ============================================

interface BuildHtmlParams {
  rows: Awaited<ReturnType<typeof getDailyAttendanceReportData>>;
  periodStart: string;
  periodEnd: string;
  printedBy: string;
}

function buildReportHtml({ rows, periodStart, periodEnd, printedBy }: BuildHtmlParams): string {
  const groupBlocks = groupDailyAttendanceRows(rows);
  const grandTotals = computeDailyAttendanceGrandTotals(rows);
  const arabicFontCss = getArabicFontCss();

  const now = new Date();
  const printDate = now.toLocaleDateString('en-GB').replace(/\//g, '-');
  const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  let counter = 0;
  const groupsHtml = groupBlocks
    .map((group) => {
      const groupRows = group.items
        .map((item) => {
          counter++;
          return `
          <tr>
            <td>${counter}</td>
            <td>${escapeHtml(item.workerName)}</td>
            <td>${escapeHtml(item.workerCode)}</td>
            <td style="text-align:center">${item.daysWorked}</td>
            <td>${item.baseAmount.toFixed(2)}</td>
            <td style="color:red">${item.totalDeductions.toFixed(2)}</td>
            <td style="color:green">${item.totalBonuses.toFixed(2)}</td>
            <td style="font-weight:bold">${item.netAmount.toFixed(2)}</td>
            <td class="signature-col"></td>
          </tr>`;
        })
        .join("");

      return `
        <tr class="group-header">
          <td colspan="9">${escapeHtml(group.groupName)} (${group.items.length} عامل)</td>
        </tr>
        ${groupRows}
        <tr class="group-total">
          <td colspan="4">إجمالي ${escapeHtml(group.groupName)}</td>
          <td>${group.totals.baseAmount.toFixed(2)}</td>
          <td style="color:red">${group.totals.totalDeductions.toFixed(2)}</td>
          <td style="color:green">${group.totals.totalBonuses.toFixed(2)}</td>
          <td style="font-weight:bold">${group.totals.netAmount.toFixed(2)}</td>
          <td></td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<title>كشف العمالة اليومية</title>
<style>
  ${arabicFontCss}
  body { font-family: 'Noto Sans Arabic Embedded', 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; direction: rtl; color: #1f2937; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { border: 1px solid #333; padding: 8px; text-align: right; font-size: 13px; }
  th { background-color: #f0f0f0; font-weight: bold; }
  .header { text-align: center; margin-bottom: 20px; }
  .header h2 { margin: 5px 0; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
  .total-row { font-weight: bold; background-color: #e8e8e8; }
  .group-header { background-color: #d4e6f1; font-weight: bold; font-size: 14px; }
  .group-total { background-color: #eaf2f8; font-weight: bold; font-size: 12px; }
  .signature-col { width: 120px; min-height: 40px; }
  .footer { text-align: center; font-size: 11px; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
  @page { size: A4 landscape; margin: 1cm; }
</style>
</head>
<body>
  <div class="header">
    <h2>كشف العمالة اليومية</h2>
  </div>
  <div class="info-row">
    <span>الفترة: ${periodStart} إلى ${periodEnd}</span>
    <span></span>
  </div>
  ${
    rows.length > 0
      ? `
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>العامل</th>
        <th>الرمز</th>
        <th>أيام العمل</th>
        <th>المستحق</th>
        <th>الخصومات</th>
        <th>الاضافي</th>
        <th>الصافي</th>
        <th>توقيع المستلم</th>
      </tr>
    </thead>
    <tbody>
      ${groupsHtml}
      <tr class="total-row">
        <td colspan="4">الإجمالي </td>
        <td>${grandTotals.baseAmount.toFixed(2)}</td>
        <td>${grandTotals.totalDeductions.toFixed(2)}</td>
        <td>${grandTotals.totalBonuses.toFixed(2)}</td>
        <td>${grandTotals.netAmount.toFixed(2)}</td>
        <td></td>
      </tr>
      <tr>
        <td colspan="9" style="background:#f0f7ff;padding:10px 12px;font-size:13px;font-weight:600;color:#1a3c6e;border-top:2px solid #4a90d9;">المبلغ الإجمالي بالأحرف: ${numberToArabicWords(grandTotals.netAmount)}</td>
      </tr>
    </tbody>
  </table>`
      : `<div style="text-align:center; padding: 60px 0; color:#9ca3af;">لا توجد بيانات للفترة والفلاتر المحددة</div>`
  }
  <div class="footer">
    <p>تم إنشاء هذا الكشف بواسطة نظام إدارة العمالة اليومية — تاريخ الطباعة: ${printDate} | وقت الطباعة: ${printTime} — تمت الطباعة بواسطة: ${escapeHtml(printedBy)}</p>
  </div>
</body>
</html>`;
}

// ============================================
// توليد ملف PDF عبر Puppeteer
// ============================================

export async function generateDailyAttendanceReportPdf(input: {
  periodStart: string;
  periodEnd: string;
  costCenterId?: number;
  groupIds?: number[];
  workerIds?: number[];
  printedBy: string;
}): Promise<Buffer> {
  const rows = await getDailyAttendanceReportData(
    input.periodStart,
    input.periodEnd,
    input.costCenterId,
    input.groupIds,
    input.workerIds
  );

  const html = buildReportHtml({
    rows,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    printedBy: input.printedBy,
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluateHandle("document.fonts.ready");
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
