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
    groupId?: number | null;
    groupName?: string;
    checkInTime: Date | string | null;
    checkOutTime: Date | string | null;
    checkInMethod: string | null;
    checkOutMethod: string | null;
    sessions?: Array<{
      checkIn?: { eventTime: Date | string; method?: string | null } | null;
      checkOut?: { eventTime: Date | string; method?: string | null } | null;
    }>;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('سجل الحضور اليومي');

  // Set RTL direction for Arabic
  worksheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 5 }];

  // ألوان هادئة تُستخدم بكل الملف
  const COLORS = {
    titleBg: 'FFE8F0FE',      // أزرق فاتح جداً
    titleText: 'FF1E3A5F',    // كحلي داكن هادئ
    subtitleText: 'FF64748B', // رمادي مزرق
    headerBg: 'FFD9E2F3',     // أزرق-رمادي فاتح
    headerText: 'FF1E3A5F',
    groupBgA: 'FFEFF6FF',     // أزرق باهت جداً
    groupBgB: 'FFF0FBF7',     // أخضر-نعناعي باهت جداً
    groupTextA: 'FF2C5282',
    groupTextB: 'FF2F855A',
    rowAltBg: 'FFF8FAFC',     // رمادي شبه أبيض للتصفيف
    border: 'FFE2E8F0',       // حدود رفيعة هادئة
  };

  // Add header
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `سجل الحضور اليومي - ${date}`;
  titleCell.font = { size: 16, bold: true, color: { argb: COLORS.titleText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  worksheet.getRow(1).height = 28;
  for (let c = 1; c <= 9; c++) {
    worksheet.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  }
  
  if (groupName) {
    worksheet.mergeCells('A2:I2');
    const groupCell = worksheet.getCell('A2');
    groupCell.value = `المجموعات: ${groupName}`;
    groupCell.font = { size: 12, color: { argb: COLORS.subtitleText }, italic: true };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Add empty row
  worksheet.addRow([]);

  // Add column headers
  const headerRow = worksheet.addRow([
    'اسم العامل',
    'كود العامل',
    'المجموعة',
    'وقت الحضور',
    'طريقة الحضور',
    'وقت الانصراف',
    'طريقة الانصراف',
    'ساعات العمل',
    'دقائق العمل'
  ]);
  
  headerRow.font = { bold: true, size: 11, color: { argb: COLORS.headerText } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  });

  // ترتيب السجلات حسب المجموعة ثم اسم العامل، حتى تصير كل مجموعة مع بعضها بالملف
  const sortedRecords = [...records].sort((a, b) => {
    const groupA = a.groupId ?? Number.MAX_SAFE_INTEGER;
    const groupB = b.groupId ?? Number.MAX_SAFE_INTEGER;
    if (groupA !== groupB) return groupA - groupB;
    return (a.workerName || '').localeCompare(b.workerName || '', 'ar');
  });

  // Helper: تنسيق ساعات العمل بصيغة "س د" بشكل يمنع مشاكل خلط الاتجاه (RTL/LTR)
  // نستخدم علامة LRM (Left-to-Right Mark) حول كل رقم حتى ما يختلط ترتيبه مع الحرف العربي المجاور
  const LRM = '\u200E';
  const formatHoursLabel = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${LRM}${h}${LRM} س ${LRM}${m}${LRM} د`;
  };

  let lastGroupKey: number | string | null = '__none__' as any;
  let groupColorToggle = false; // يتبدّل مع كل مجموعة جديدة لتمييزها عن اللي قبلها
  let dataRowCounter = 0; // لتصفيف صفوف البيانات (Zebra striping)

  // Add data rows — كل جلسة (حضور/انصراف) بصف مستقل، ومجمّعة بعنوان لكل مجموعة
  for (const record of sortedRecords) {
    const groupKey = record.groupId ?? 'بدون مجموعة';
    if (groupKey !== lastGroupKey) {
      lastGroupKey = groupKey;
      groupColorToggle = !groupColorToggle;
      dataRowCounter = 0; // نبدأ التصفيف من جديد مع كل مجموعة
      const bg = groupColorToggle ? COLORS.groupBgA : COLORS.groupBgB;
      const fg = groupColorToggle ? COLORS.groupTextA : COLORS.groupTextB;

      const sectionRow = worksheet.addRow([`${record.groupName || 'بدون مجموعة'}`]);
      worksheet.mergeCells(`A${sectionRow.number}:I${sectionRow.number}`);
      sectionRow.font = { bold: true, size: 11, color: { argb: fg } };
      sectionRow.height = 20;
      sectionRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      });
      sectionRow.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    // ✅ عرض كل الجلسات — لو عنده جلسات متعددة نعرضها كلها (نفس منطق الشاشة)
    const sessions = record.sessions && record.sessions.length > 0
      ? record.sessions
      : [{
          checkIn: record.checkInTime ? { eventTime: record.checkInTime, method: record.checkInMethod } : null,
          checkOut: record.checkOutTime ? { eventTime: record.checkOutTime, method: record.checkOutMethod } : null,
        }];

    for (const session of sessions) {
      const checkInDate = session.checkIn?.eventTime ? new Date(session.checkIn.eventTime) : null;
      const checkOutDate = session.checkOut?.eventTime ? new Date(session.checkOut.eventTime) : null;

      const workMinutes = checkInDate && checkOutDate
        ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000)
        : null;

      const row = worksheet.addRow([
        record.workerName,
        record.workerCode,
        record.groupName || 'بدون مجموعة',
        checkInDate ? checkInDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
        session.checkIn?.method || '-',
        checkOutDate ? checkOutDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
        session.checkOut?.method || '-',
        workMinutes !== null ? formatHoursLabel(workMinutes) : '-',
        workMinutes !== null ? workMinutes : '-'
      ]);

      row.alignment = { horizontal: 'center', vertical: 'middle' };
      // خلية "ساعات العمل" فيها نص عربي ممزوج بأرقام — نثبّت اتجاهها RTL صراحة لضمان ترتيب ثابت
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
      // خلية "دقائق العمل" رقم صرف — نخليها LTR عادي زي أي رقم
      row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'ltr' };

      // تصفيف هادئ لصفوف البيانات (Zebra striping) لسهولة القراءة
      dataRowCounter++;
      if (dataRowCounter % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.rowAltBg } };
        });
      }
    }
  }

  // Set column widths
  worksheet.columns = [
    { width: 20 }, // اسم العامل
    { width: 15 }, // كود العامل
    { width: 20 }, // المجموعة
    { width: 15 }, // وقت الحضور
    { width: 15 }, // طريقة الحضور
    { width: 15 }, // وقت الانصراف
    { width: 15 }, // طريقة الانصراف
    { width: 16 }, // ساعات العمل
    { width: 14 }  // دقائق العمل
  ];

  // حدود رفيعة هادئة على كل الخلايا (بدل الحدود السوداء الغامقة)
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } }
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ============================================
// تصدير سجل الفترة (من-إلى): اسم العامل ثم تفاصيل كل يوم تحته
// ============================================
export async function generatePeriodAttendanceExcel(
  startDate: string,
  endDate: string,
  groupName: string | null,
  workers: Array<{
    workerId: number;
    workerName: string;
    workerCode: string;
    groupId: number | null;
    groupName?: string;
    totalDays: number;
    totalMinutes: number;
    days: Array<{
      workDate: string;
      dayMinutes: number;
      sessions: Array<{
        checkIn: { eventTime: string; method: string | null } | null;
        checkOut: { eventTime: string; method: string | null } | null;
      }>;
    }>;
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('سجل حضور الفترة');

  worksheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 5 }];

  // نفس لوحة الألوان الهادئة المستخدمة بباقي الملفات
  const COLORS = {
    titleBg: 'FFE8F0FE',
    titleText: 'FF1E3A5F',
    subtitleText: 'FF64748B',
    headerBg: 'FFD9E2F3',
    headerText: 'FF1E3A5F',
    groupBgA: 'FFEFF6FF',
    groupBgB: 'FFF0FBF7',
    groupTextA: 'FF2C5282',
    groupTextB: 'FF2F855A',
    workerBg: 'FFFDF6E3',
    workerText: 'FF8A6D00',
    rowAltBg: 'FFF8FAFC',
    border: 'FFE2E8F0',
  };

  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `سجل حضور الفترة - من ${startDate} إلى ${endDate}`;
  titleCell.font = { size: 16, bold: true, color: { argb: COLORS.titleText } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;
  for (let c = 1; c <= 7; c++) {
    worksheet.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  }

  if (groupName) {
    worksheet.mergeCells('A2:G2');
    const groupCell = worksheet.getCell('A2');
    groupCell.value = `المجموعات: ${groupName}`;
    groupCell.font = { size: 12, color: { argb: COLORS.subtitleText }, italic: true };
    groupCell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  worksheet.addRow([]);

  const headerRow = worksheet.addRow([
    'التاريخ / اسم العامل',
    'وقت الحضور',
    'طريقة الحضور',
    'وقت الانصراف',
    'طريقة الانصراف',
    'دقائق العمل',
    'ساعات العمل',
  ]);
  headerRow.font = { bold: true, size: 11, color: { argb: COLORS.headerText } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  });

  const LRM = '\u200E';
  const formatHoursLabel = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${LRM}${h}${LRM} س ${LRM}${m}${LRM} د`;
  };

  const sortedWorkers = [...workers].sort((a, b) => {
    const groupA = a.groupId ?? Number.MAX_SAFE_INTEGER;
    const groupB = b.groupId ?? Number.MAX_SAFE_INTEGER;
    if (groupA !== groupB) return groupA - groupB;
    return (a.workerName || '').localeCompare(b.workerName || '', 'ar');
  });

  let lastGroupKey: number | string | null = '__none__' as any;
  let groupColorToggle = false;

  for (const worker of sortedWorkers) {
    const groupKey = worker.groupId ?? 'بدون مجموعة';
    if (groupKey !== lastGroupKey) {
      lastGroupKey = groupKey;
      groupColorToggle = !groupColorToggle;
      const bg = groupColorToggle ? COLORS.groupBgA : COLORS.groupBgB;
      const fg = groupColorToggle ? COLORS.groupTextA : COLORS.groupTextB;

      const sectionRow = worksheet.addRow([`${worker.groupName || 'بدون مجموعة'}`]);
      worksheet.mergeCells(`A${sectionRow.number}:G${sectionRow.number}`);
      sectionRow.font = { bold: true, size: 11, color: { argb: fg } };
      sectionRow.height = 20;
      sectionRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      });
      sectionRow.alignment = { horizontal: 'right', vertical: 'middle' };
    }

    const workerRow = worksheet.addRow([
      `${worker.workerName} (${worker.workerCode}) — ${worker.totalDays} يوم حضور`,
      '', '', '', '',
      worker.totalMinutes,
      formatHoursLabel(worker.totalMinutes),
    ]);
    worksheet.mergeCells(`A${workerRow.number}:E${workerRow.number}`);
    workerRow.font = { bold: true, size: 11, color: { argb: COLORS.workerText } };
    workerRow.height = 20;
    workerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.workerBg } };
    });
    workerRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    workerRow.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'ltr' };
    workerRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };

    // تفاصيل كل يوم تحت اسم العامل
    let rowCounter = 0;
    for (const day of worker.days) {
      const sessions = day.sessions.length > 0 ? day.sessions : [{ checkIn: null, checkOut: null }];
      for (const session of sessions) {
        const checkInDate = session.checkIn?.eventTime ? new Date(session.checkIn.eventTime) : null;
        const checkOutDate = session.checkOut?.eventTime ? new Date(session.checkOut.eventTime) : null;

        // دقائق هذه الجلسة تحديدًا (مو إجمالي اليوم) — حتى ما تتكرر نفس القيمة لو فيه أكثر من جلسة بنفس اليوم
        const sessionMinutes = checkInDate && checkOutDate
          ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000)
          : null;

        const dayLabel = new Date(day.workDate).toLocaleDateString('ar-SA', {
          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        });

        const row = worksheet.addRow([
          dayLabel,
          checkInDate ? checkInDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
          session.checkIn?.method || '-',
          checkOutDate ? checkOutDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
          session.checkOut?.method || '-',
          sessionMinutes !== null ? sessionMinutes : '-',
          sessionMinutes !== null ? formatHoursLabel(sessionMinutes) : '-',
        ]);
        row.alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
        row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'ltr' };

        rowCounter++;
        if (rowCounter % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.rowAltBg } };
          });
        }
      }
    }
  }

  worksheet.columns = [
    { width: 26 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 14 },
    { width: 16 },
  ];

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.border } },
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
