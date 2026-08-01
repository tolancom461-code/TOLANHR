import puppeteer from "puppeteer";
import { getCeoReportsData } from "./ceoReports";
import * as db from "./db";
import {
  createCeoReportSections,
  type CeoReportSection,
  type CeoShiftCategory,
} from "../shared/ceoReportsAggregation";

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

function buildReportPageHtml(
  section: CeoReportSection,
  periodStart: string,
  periodEnd: string
): string {
  const now = new Date();
  const issueDate = now.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issueTime = now.toLocaleTimeString("ar-SA");
  const totalNet = section.rows.reduce((sum, row) => sum + row.totalNet, 0);
  const isRed = section.costCenterCode === "CC06";
  const mainColor = isRed ? "#B92D38" : "#1e40af";
  const darkColor = isRed ? "#A32631" : "#1e3a8a";
  const bodyRows = section.rows
    .map(
      (row, index) => `
        <tr>
          <td class="c center mono">${index + 1}</td>
          <td class="c bold">${escapeHtml(row.label)}</td>
          <td class="c center black net-cell">${formatCurrencyNet(row.totalNet)}</td>
        </tr>`
    )
    .join("");

  return `
    <section class="report-page" style="--main-color:${mainColor};--dark-color:${darkColor}">
      <div class="header">
        <div class="meta-box">
          <div><span class="label">تاريخ الإصدار:</span><span>${issueDate}</span></div>
          <div><span class="label">وقت الإصدار:</span><span>${issueTime}</span></div>
        </div>
        <h1>حديقة الوطن - ${escapeHtml(section.costCenterName)}</h1>
        <h2>${escapeHtml(section.title)}</h2>
        <div class="period">للفترة من: <strong>${periodStart}</strong> إلى: <strong>${periodEnd}</strong></div>
      </div>
      <div class="content">
        ${
          section.rows.length > 0
            ? `
          <table>
            <colgroup>
              <col class="n1" /><col class="n2" /><col class="n3" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th class="right">التصنيف</th>
                <th class="net-head">صافي المبلغ</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="2">الإجمالي</td>
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
            : `<div class="empty-state">لا توجد بيانات مصنفة للفترة المحددة</div>`
        }
      </div>
    </section>`;
}

function buildReportHtml(
  sections: CeoReportSection[],
  periodStart: string,
  periodEnd: string
): string {
  const pages = sections
    .map(section => buildReportPageHtml(section, periodStart, periodEnd))
    .join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Cairo", "Arial", "Tahoma", sans-serif;
    margin: 0;
    padding: 0;
    color: #1f2937;
    background: #ffffff;
  }
  .report-page {
    break-after: page;
    page-break-after: always;
  }
  .report-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
  .header {
    background: var(--main-color);
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
  .header .meta-box div {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 4px;
  }
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
  .content { padding: 16.524px 24px 18.36px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-bottom: 14.688px;
    table-layout: fixed;
    line-height: 1.3;
  }
  col.n1 { width: 8%; }
  col.n2 { width: 55%; }
  col.n3 { width: 37%; }
  thead tr { background: #f3f4f6; color: #1e3a8a; }
  th, td.c { border: 1px solid #d1d5db; }
  th { padding: 8.64px 8px; text-align: center; white-space: nowrap; }
  th.right { text-align: right; }
  th.net-head { background: #eff6ff; }
  tbody td.c { padding: 8px; }
  .net-cell { background: rgba(239,246,255,0.5); font-weight: 900; }
  .sar-small { font-size: 50%; }
  td.center { text-align: center; white-space: nowrap; }
  td.bold { font-weight: 700; }
  td.mono { font-family: "Courier New", monospace; }
  td.black { font-weight: 900; }
  tfoot td {
    background: var(--dark-color);
    color: #ffffff;
    font-weight: 700;
    border: 1px solid var(--dark-color);
    padding: 8px;
    text-align: center;
    font-size: 15px;
    white-space: nowrap;
  }
  tfoot td.net-total { background: var(--main-color); font-size: 16px; }
  .amount-words {
    background: #eff6ff;
    border-right: 4px solid var(--main-color);
    padding: 12.24px;
    margin-bottom: 12.852px;
    font-size: 15px;
  }
  .amount-words .label { color: var(--main-color); font-weight: 700; margin-left: 8px; }
  .amount-words .value { font-weight: 900; }
  .signatures {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
    margin-top: 15.12px;
    text-align: center;
  }
  .signatures .slot { padding-bottom: 9px; border-bottom: 1px solid #9ca3af; }
  .signatures .role { font-weight: 700; font-size: 13px; margin: 0; }
  .signatures .role.exec { font-weight: 900; }
  .signatures .name { font-size: 11px; margin-top: 4px; white-space: nowrap; }
  .empty-state { text-align: center; padding: 60px 0; color: #9ca3af; }
  @page { size: A4 landscape; margin: 1cm; }
</style>
</head>
<body>${pages}</body>
</html>`;
}

export async function generateCeoReportsPdf(input: {
  periodStart: string;
  periodEnd: string;
  costCenterIds: number[];
  morningGroupIds: number[];
  eveningGroupIds: number[];
  selectedShifts: CeoShiftCategory[];
  mergeShifts: boolean;
  reportTitle: string;
}): Promise<Buffer> {
  const [allRows, costCenters] = await Promise.all([
    getCeoReportsData(input.periodStart, input.periodEnd, input.costCenterIds),
    db.getAllCostCenters(),
  ]);
  const selectedIdSet = new Set(input.costCenterIds);
  const selectedCostCenters = costCenters.filter(costCenter =>
    selectedIdSet.has(costCenter.id)
  );
  const sections = createCeoReportSections({
    rows: allRows,
    costCenters: selectedCostCenters,
    morningGroupIds: input.morningGroupIds,
    eveningGroupIds: input.eveningGroupIds,
    selectedShifts: input.selectedShifts,
    mergeShifts: input.mergeShifts,
    reportTitle: input.reportTitle,
  });

  if (sections.length === 0) {
    throw new Error("No valid cost centers were selected for the CEO report");
  }

  const html = buildReportHtml(sections, input.periodStart, input.periodEnd);
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
