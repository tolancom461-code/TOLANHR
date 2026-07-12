import ExcelJS from 'exceljs';
import { getAttendanceForWorkerPeriod, getDailyFinanceForWorker } from './db';

export async function generateBatchDetailsExcel(
  batchId: number,
  batchTitle: string,
  periodStart: string,
  periodEnd: string,
  workers: Array<{
    workerId: number;
    workerName: string;
    workerCode: string;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('تفاصيل دفعة الراتب');

  // Set RTL direction for Arabic
  worksheet.views = [{ rightToLeft: true }];

  // Add header
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `تفاصيل ${batchTitle}`;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  worksheet.mergeCells('A2:I2');
  const periodCell = worksheet.getCell('A2');
  periodCell.value = `الفترة: من ${periodStart} إلى ${periodEnd}`;
  periodCell.font = { size: 12 };
  periodCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add empty row
  worksheet.addRow([]);

  // Add column headers
  const headerRow = worksheet.addRow([
    'اسم العامل',
    'كود العامل',
    'التاريخ',
    'وقت الحضور',
    'وقت الانصراف',
    'دقائق العمل الفعلية',
    'المبلغ الأساسي',
    'الخصومات',
    'الإضافات'
  ]);
  
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' }
  };

  // Set column widths
  worksheet.columns = [
    { width: 20 }, // اسم العامل
    { width: 15 }, // كود العامل
    { width: 15 }, // التاريخ
    { width: 15 }, // وقت الحضور
    { width: 15 }, // وقت الانصراف
    { width: 20 }, // دقائق العمل الفعلية
    { width: 15 }, // المبلغ الأساسي
    { width: 15 }, // الخصومات
    { width: 15 }  // الإضافات
  ];

  // Add data for each worker
  for (const worker of workers) {
    const attendanceData = await getAttendanceForWorkerPeriod(
      worker.workerId,
      periodStart,
      periodEnd
    );

    // Get daily finance data for this worker
    const dailyFinanceData = await getDailyFinanceForWorker(
      worker.workerId,
      periodStart,
      periodEnd
    );
    
    // Create a map for quick lookup
    const financeMap = new Map(
      dailyFinanceData.map((f: any) => [f.workDate, f])
    );

    for (const day of attendanceData) {
      const finance = financeMap.get(day.date);
      const checkInTime = day.checkIn
        ? new Date(day.checkIn.eventTime).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
          })
        : '-';
      
      const checkOutTime = day.checkOut
        ? new Date(day.checkOut.eventTime).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
          })
        : '-';

      const row = worksheet.addRow([
        worker.workerName,
        worker.workerCode,
        day.date,
        checkInTime,
        checkOutTime,
        day.actualWorkMinutes || 0,
        finance?.baseAmount || 0,
        finance?.deductions || 0,
        finance?.bonuses || 0
      ]);

      row.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // Format numbers
      row.getCell(6).numFmt = '#,##0'; // دقائق العمل
      row.getCell(7).numFmt = '#,##0.00'; // المبلغ
      row.getCell(8).numFmt = '#,##0.00'; // الخصومات
      row.getCell(9).numFmt = '#,##0.00'; // الإضافات
    }
  }

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 2) {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}


export async function generateAttendanceLogExcel(
  date: string,
  groupName: string | null,
  records: Array<{
    workerName: string;
    workerCode: string;
    checkInTime: Date | null;
    checkOutTime: Date | null;
    checkInMethod: string | null;
    checkOutMethod: string | null;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('سجل الحضور اليومي');

  // Set RTL direction for Arabic
  worksheet.views = [{ rightToLeft: true }];

  // Add header
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `سجل الحضور اليومي - ${date}`;
  titleCell.font = { size: 16, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  
  if (groupName) {
    worksheet.mergeCells('A2:G2');
    const groupCell = worksheet.getCell('A2');
    groupCell.value = `المجموعة: ${groupName}`;
    groupCell.font = { size: 12 };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Add empty row
  worksheet.addRow([]);

  // Add column headers
  const headerRow = worksheet.addRow([
    'اسم العامل',
    'كود العامل',
    'وقت الحضور',
    'طريقة الحضور',
    'وقت الانصراف',
    'طريقة الانصراف',
    'دقائق العمل'
  ]);
  
  headerRow.font = { bold: true, size: 11 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Add data rows
  for (const record of records) {
    const workMinutes = record.checkInTime && record.checkOutTime
      ? Math.round((record.checkOutTime.getTime() - record.checkInTime.getTime()) / 60000)
      : null;

    const row = worksheet.addRow([
      record.workerName,
      record.workerCode,
      record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      record.checkInMethod || '-',
      record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
      record.checkOutMethod || '-',
      workMinutes !== null ? `${workMinutes} دقيقة` : '-'
    ]);

    row.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Set column widths
  worksheet.columns = [
    { width: 20 }, // اسم العامل
    { width: 15 }, // كود العامل
    { width: 15 }, // وقت الحضور
    { width: 15 }, // طريقة الحضور
    { width: 15 }, // وقت الانصراف
    { width: 15 }, // طريقة الانصراف
    { width: 15 }  // دقائق العمل
  ];

  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
