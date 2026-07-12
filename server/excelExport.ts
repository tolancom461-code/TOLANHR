import ExcelJS from 'exceljs';

export interface AttendanceReportRow {
  workerName: string;
  workerCode: string;
  groupName: string;
  daysWorked: number;
  daysLate: number;
  daysAbsent: number;
  totalHours: number;
  lateMinutes: number;
}

export interface PayrollReportRow {
  workerName: string;
  workerCode: string | null;
  groupName: string;
  baseSalary: number;
  deductions: number;
  bonuses: number;
  netSalary: number;
}

export async function generateAttendanceExcel(
  data: AttendanceReportRow[],
  month: string,
  year: number
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('تقرير الحضور');

  // Set RTL direction
  worksheet.views = [{ rightToLeft: true }];

  // Add title
  worksheet.mergeCells('A1:H1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `تقرير الحضور - ${month} ${year}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Add headers
  const headers = [
    'اسم العامل',
    'رمز العامل',
    'المجموعة',
    'أيام العمل',
    'أيام التأخير',
    'أيام الغياب',
    'إجمالي الساعات',
    'دقائق التأخير',
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B82F6' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Add data rows
  data.forEach((row) => {
    const dataRow = worksheet.addRow([
      row.workerName,
      row.workerCode,
      row.groupName,
      row.daysWorked,
      row.daysLate,
      row.daysAbsent,
      row.totalHours.toFixed(2),
      row.lateMinutes,
    ]);
    dataRow.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Add summary row
  const summaryRow = worksheet.addRow([
    'الإجمالي',
    '',
    '',
    data.reduce((sum, row) => sum + row.daysWorked, 0),
    data.reduce((sum, row) => sum + row.daysLate, 0),
    data.reduce((sum, row) => sum + row.daysAbsent, 0),
    data.reduce((sum, row) => sum + row.totalHours, 0).toFixed(2),
    data.reduce((sum, row) => sum + row.lateMinutes, 0),
  ]);
  summaryRow.font = { bold: true };
  summaryRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  };
  summaryRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Set column widths
  worksheet.columns = [
    { width: 20 }, // اسم العامل
    { width: 15 }, // رمز العامل
    { width: 20 }, // المجموعة
    { width: 12 }, // أيام العمل
    { width: 12 }, // أيام التأخير
    { width: 12 }, // أيام الغياب
    { width: 15 }, // إجمالي الساعات
    { width: 15 }, // دقائق التأخير
  ];

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generatePayrollExcel(
  data: PayrollReportRow[],
  batchName: string,
  period: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('تقرير الرواتب');

  // Set RTL direction
  worksheet.views = [{ rightToLeft: true }];

  // Add title
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `تقرير الرواتب - ${batchName}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF059669' },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Add period
  worksheet.mergeCells('A2:G2');
  const periodCell = worksheet.getCell('A2');
  periodCell.value = `الفترة: ${period}`;
  periodCell.font = { size: 12, bold: true };
  periodCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  // Add headers
  const headers = [
    'اسم العامل',
    'رمز العامل',
    'المجموعة',
    'الراتب الأساسي',
    'الخصومات',
    'المكافآت',
    'صافي الراتب',
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF10B981' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Add data rows
  data.forEach((row) => {
    const dataRow = worksheet.addRow([
      row.workerName,
      row.workerCode,
      row.groupName,
      row.baseSalary.toFixed(2),
      row.deductions.toFixed(2),
      row.bonuses.toFixed(2),
      row.netSalary.toFixed(2),
    ]);
    dataRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Format currency cells
    [3, 4, 5, 6].forEach((colIndex) => {
      const cell = dataRow.getCell(colIndex);
      cell.numFmt = '#,##0.00';
    });
  });

  // Add summary row
  const summaryRow = worksheet.addRow([
    'الإجمالي',
    '',
    '',
    data.reduce((sum, row) => sum + row.baseSalary, 0).toFixed(2),
    data.reduce((sum, row) => sum + row.deductions, 0).toFixed(2),
    data.reduce((sum, row) => sum + row.bonuses, 0).toFixed(2),
    data.reduce((sum, row) => sum + row.netSalary, 0).toFixed(2),
  ]);
  summaryRow.font = { bold: true };
  summaryRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' },
  };
  summaryRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Format currency cells in summary
  [3, 4, 5, 6].forEach((colIndex) => {
    const cell = summaryRow.getCell(colIndex);
    cell.numFmt = '#,##0.00';
  });

  // Set column widths
  worksheet.columns = [
    { width: 20 }, // اسم العامل
    { width: 15 }, // رمز العامل
    { width: 20 }, // المجموعة
    { width: 15 }, // الراتب الأساسي
    { width: 15 }, // الخصومات
    { width: 15 }, // المكافآت
    { width: 15 }, // صافي الراتب
  ];

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
