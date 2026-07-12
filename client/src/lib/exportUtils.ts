import * as XLSX from 'xlsx';

/**
 * Export data to Excel file
 * @param data - Array of objects to export
 * @param filename - Name of the file (without extension)
 * @param sheetName - Name of the worksheet
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Sheet1'
): void {
  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);

  // Auto-size columns
  const columnWidths = Object.keys(data[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] || '').length)
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  worksheet['!cols'] = columnWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export multiple sheets to Excel file
 * @param sheets - Array of {data, sheetName} objects
 * @param filename - Name of the file (without extension)
 */
export function exportMultipleSheetsToExcel<T extends Record<string, any>>(
  sheets: Array<{ data: T[]; sheetName: string }>,
  filename: string
): void {
  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ data, sheetName }) => {
    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto-size columns
    if (data.length > 0) {
      const columnWidths = Object.keys(data[0]).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...data.map((row) => String(row[key] || '').length)
        );
        return { wch: Math.min(maxLength + 2, 50) };
      });
      worksheet['!cols'] = columnWidths;
    }

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Print the current page or a specific element
 * @param elementId - Optional ID of element to print (if not provided, prints entire page)
 */
export function printPage(elementId?: string): void {
  if (elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element with ID "${elementId}" not found`);
      return;
    }

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      console.error('Could not open print window');
      return;
    }

    // Copy styles from parent document
    const styles = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          return Array.from(styleSheet.cssRules)
            .map((rule) => rule.cssText)
            .join('\n');
        } catch (e) {
          // Handle CORS issues with external stylesheets
          return '';
        }
      })
      .join('\n');

    // Write content to print window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>طباعة</title>
          <style>
            ${styles}
            @media print {
              body { margin: 0; padding: 20px; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          ${element.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  } else {
    // Print entire page
    window.print();
  }
}

/**
 * Format currency for Excel export
 * @param amount - Amount to format
 * @returns Formatted number (Excel will handle currency formatting)
 */
export function formatCurrencyForExcel(amount: string | number): number {
  return typeof amount === 'string' ? parseFloat(amount) : amount;
}

/**
 * Format date for Excel export
 * @param date - Date to format
 * @returns ISO date string
 */
export function formatDateForExcel(date: Date | string): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

/**
 * Prepare financial report data for Excel export
 */
export function prepareFinancialReportForExcel(
  report: any,
  reportType: 'worker' | 'group' | 'costCenter' | 'summary'
) {
  const timestamp = new Date().toISOString().split('T')[0];
  
  switch (reportType) {
    case 'worker':
      return {
        filename: `تقرير_عامل_${report.worker.code}_${timestamp}`,
        sheets: [
          {
            sheetName: 'الملخص',
            data: [
              {
                'اسم العامل': report.worker.fullName,
                'كود العامل': report.worker.code,
                'أيام العمل': report.summary.totalDaysWorked,
                'إجمالي الحضور': formatCurrencyForExcel(report.summary.totalBaseAmount),
                'إجمالي الخصومات': formatCurrencyForExcel(report.summary.totalDeductions),
                'إجمالي الإضافات': formatCurrencyForExcel(report.summary.totalBonuses),
                'الصافي النهائي': formatCurrencyForExcel(report.summary.totalNetAmount),
              }
            ]
          },
          {
            sheetName: 'السجلات اليومية',
            data: report.dailyRecords.map((record: any) => ({
              'التاريخ': formatDateForExcel(record.workDate),
              'الأجر الأساسي': formatCurrencyForExcel(record.baseAmount),
              'الخصومات': formatCurrencyForExcel(record.deductions),
              'الإضافات': formatCurrencyForExcel(record.bonuses),
              'الصافي': formatCurrencyForExcel(record.netAmount),
              'دقائق التأخير': record.lateMinutes || 0,
              'دقائق المغادرة المبكرة': record.earlyLeaveMinutes || 0,
              'ملاحظات': record.notes || '-'
            }))
          }
        ]
      };

    case 'group':
      return {
        filename: `تقرير_مجموعة_${report.group.code}_${timestamp}`,
        sheets: [
          {
            sheetName: 'الملخص',
            data: [
              {
                'اسم المجموعة': report.group.name,
                'كود المجموعة': report.group.code,
                'عدد العمال': report.summary.totalWorkers,
                'أيام العمل': report.summary.totalDaysWorked,
                'إجمالي الحضور': formatCurrencyForExcel(report.summary.totalBaseAmount),
                'إجمالي الخصومات': formatCurrencyForExcel(report.summary.totalDeductions),
                'إجمالي الإضافات': formatCurrencyForExcel(report.summary.totalBonuses),
                'الصافي النهائي': formatCurrencyForExcel(report.summary.totalNetAmount),
              }
            ]
          },
          {
            sheetName: 'تفاصيل العمال',
            data: report.workerReports.map((worker: any) => ({
              'اسم العامل': worker.workerName,
              'كود العامل': worker.workerCode,
              'أيام العمل': worker.totalDaysWorked,
              'الحضور': formatCurrencyForExcel(worker.totalBaseAmount),
              'الخصومات': formatCurrencyForExcel(worker.totalDeductions),
              'الإضافات': formatCurrencyForExcel(worker.totalBonuses),
              'الصافي': formatCurrencyForExcel(worker.totalNetAmount),
            }))
          }
        ]
      };

    case 'costCenter':
      return {
        filename: `تقرير_مركز_تكلفة_${report.costCenter.code}_${timestamp}`,
        sheets: [
          {
            sheetName: 'الملخص',
            data: [
              {
                'اسم مركز التكلفة': report.costCenter.name,
                'كود مركز التكلفة': report.costCenter.code,
                'عدد المجموعات': report.summary.totalGroups,
                'عدد العمال': report.summary.totalWorkers,
                'أيام العمل': report.summary.totalDaysWorked,
                'إجمالي الحضور': formatCurrencyForExcel(report.summary.totalBaseAmount),
                'إجمالي الخصومات': formatCurrencyForExcel(report.summary.totalDeductions),
                'إجمالي الإضافات': formatCurrencyForExcel(report.summary.totalBonuses),
                'الصافي النهائي': formatCurrencyForExcel(report.summary.totalNetAmount),
              }
            ]
          },
          {
            sheetName: 'تفاصيل المجموعات',
            data: report.groupReports.map((group: any) => ({
              'اسم المجموعة': group.groupName,
              'كود المجموعة': group.groupCode,
              'عدد العمال': group.totalWorkers,
              'الحضور': formatCurrencyForExcel(group.totalBaseAmount),
              'الخصومات': formatCurrencyForExcel(group.totalDeductions),
              'الإضافات': formatCurrencyForExcel(group.totalBonuses),
              'الصافي': formatCurrencyForExcel(group.totalNetAmount),
            }))
          }
        ]
      };

    case 'summary':
      return {
        filename: `تقرير_مالي_شامل_${timestamp}`,
        sheets: [
          {
            sheetName: 'الملخص العام',
            data: [
              {
                'عدد مراكز التكلفة': report.summary.totalCostCenters,
                'عدد المجموعات': report.summary.totalGroups,
                'عدد العمال': report.summary.totalWorkers,
                'أيام العمل': report.summary.totalDaysWorked,
                'إجمالي الحضور': formatCurrencyForExcel(report.summary.totalBaseAmount),
                'إجمالي الخصومات': formatCurrencyForExcel(report.summary.totalDeductions),
                'إجمالي الإضافات': formatCurrencyForExcel(report.summary.totalBonuses),
                'الصافي النهائي': formatCurrencyForExcel(report.summary.totalNetAmount),
              }
            ]
          },
          {
            sheetName: 'مراكز التكلفة',
            data: report.costCenterReports.map((cc: any) => ({
              'اسم مركز التكلفة': cc.costCenterName,
              'كود مركز التكلفة': cc.costCenterCode,
              'عدد المجموعات': cc.totalGroups,
              'عدد العمال': cc.totalWorkers,
              'الحضور': formatCurrencyForExcel(cc.totalBaseAmount),
              'الخصومات': formatCurrencyForExcel(cc.totalDeductions),
              'الإضافات': formatCurrencyForExcel(cc.totalBonuses),
              'الصافي': formatCurrencyForExcel(cc.totalNetAmount),
            }))
          }
        ]
      };

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}
