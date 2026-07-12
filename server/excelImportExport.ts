import ExcelJS from 'exceljs';
import { z } from 'zod';

// ============================================
// Validation Schemas
// ============================================

export const GroupImportSchema = z.object({
  code: z.string().min(1, 'الكود مطلوب'),
  name: z.string().min(2, 'الاسم مطلوب'),
  costCenterId: z.number().optional().nullable(),
  supervisorId: z.number().optional().nullable(),
  dailyRate: z.string().optional().nullable(),
  dailyWage: z.string().optional().nullable(),
  workMinutes: z.string().optional().nullable(),
  latePenaltyRate: z.string().optional().nullable(),
  earlyLeavePenaltyRate: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const WorkerImportSchema = z.object({
  code: z.string().min(1, 'كود العامل مطلوب'),
  fullName: z.string().min(2, 'اسم العامل مطلوب'),
  nationalId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  groupCode: z.string().min(1, 'كود المجموعة مطلوب'),
  hireDate: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
});

export type GroupImportData = z.infer<typeof GroupImportSchema>;
export type WorkerImportData = z.infer<typeof WorkerImportSchema>;

// ============================================
// Import Functions
// ============================================

export async function parseGroupsFromExcel(buffer: any): Promise<{
  data: GroupImportData[];
  errors: Array<{ row: number; message: string }>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('الملف لا يحتوي على أي أوراق عمل');
  }

  const data: GroupImportData[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  // Skip header row
  let rowIndex = 2;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    try {
      const values = row.values as any[];
      
      if (!values[1]) return; // Skip empty rows

      const groupData = {
        code: String(values[1] || '').trim(),
        name: String(values[2] || '').trim(),
        costCenterId: values[3] ? parseInt(String(values[3])) : null,
        supervisorId: values[4] ? parseInt(String(values[4])) : null,
        dailyRate: values[5] ? String(values[5]) : null,
        dailyWage: values[7] ? String(values[7]) : null,
        workMinutes: values[8] ? String(values[8]) : null,
        latePenaltyRate: values[9] ? String(values[9]) : null,
        earlyLeavePenaltyRate: values[10] ? String(values[10]) : null,

        isActive: values[13] !== false,
      };

      const validated = GroupImportSchema.parse(groupData);
      data.push(validated);
    } catch (error: any) {
      errors.push({
        row: rowNumber,
        message: error.message || 'خطأ في البيانات',
      });
    }
  });

  return { data, errors };
}

export async function parseWorkersFromExcel(buffer: any): Promise<{
  data: WorkerImportData[];
  errors: Array<{ row: number; message: string }>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('الملف لا يحتوي على أي أوراق عمل');
  }

  const data: WorkerImportData[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  // Skip header row - الحقول الأساسية فقط (7 حقول)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    try {
      const values = row.values as any[];
      
      if (!values[1]) return; // Skip empty rows

      const workerData = {
        code: String(values[1] || '').trim(),
        fullName: String(values[2] || '').trim(),
        nationalId: values[3] ? String(values[3]) : null,
        phone: values[4] ? String(values[4]) : null,
        groupCode: String(values[5] || '').trim(),
        hireDate: values[6] ? String(values[6]) : null,
        status: values[7] ? String(values[7]) : 'active',
      };

      const validated = WorkerImportSchema.parse(workerData);
      data.push(validated);
    } catch (error: any) {
      errors.push({
        row: rowNumber,
        message: error.message || 'خطأ في البيانات',
      });
    }
  });

  return { data, errors };
}

// ============================================
// Export Functions
// ============================================

export async function generateGroupsExcelTemplate(): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('المجموعات');

  // Set column widths
  worksheet.columns = [
    { header: 'الكود', key: 'code', width: 15 },
    { header: 'الاسم', key: 'name', width: 25 },
    { header: 'مركز التكلفة ID', key: 'costCenterId', width: 15 },
    { header: 'المشرف ID', key: 'supervisorId', width: 15 },
    { header: 'معدل الراتب اليومي', key: 'dailyRate', width: 18 },
    { header: 'الراتب اليومي', key: 'dailyWage', width: 15 },
    { header: 'دقائق العمل', key: 'workMinutes', width: 15 },
    { header: 'معدل غرامة التأخير', key: 'latePenaltyRate', width: 18 },
    { header: 'معدل غرامة المغادرة المبكرة', key: 'earlyLeavePenaltyRate', width: 20 },
    { header: 'نشط', key: 'isActive', width: 10 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add sample row
  worksheet.addRow({
    code: 'TECH',
    name: 'الفنيين',
    costCenterId: 1,
    supervisorId: 1,
    dailyRate: '100.00',
    dailyWage: '100.00',
    workMinutes: 480,
    latePenaltyRate: '5.00',
    earlyLeavePenaltyRate: '5.00',

    isActive: true,
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

export async function generateWorkersExcelTemplate(): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('العمال');

  // Set column widths - الحقول الأساسية فقط (7 حقول)
  worksheet.columns = [
    { header: 'كود العامل', key: 'code', width: 15 },
    { header: 'اسم العامل', key: 'fullName', width: 25 },
    { header: 'رقم الهوية', key: 'nationalId', width: 20 },
    { header: 'رقم الجوال', key: 'phone', width: 15 },
    { header: 'كود المجموعة', key: 'groupCode', width: 15 },
    { header: 'تاريخ التعيين', key: 'hireDate', width: 15 },
    { header: 'الحالة', key: 'status', width: 15 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add sample row
  worksheet.addRow({
    code: 'W001',
    fullName: 'أحمد محمد',
    nationalId: '1234567890',
    phone: '0501234567',
    groupCode: 'TECH',
    hireDate: '2026-01-01',
    status: 'active',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

export async function generateGroupsExcelExport(groups: any[]): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('المجموعات');

  // Set column widths
  worksheet.columns = [
    { header: 'المعرف', key: 'id', width: 10 },
    { header: 'الكود', key: 'code', width: 15 },
    { header: 'الاسم', key: 'name', width: 25 },
    { header: 'مركز التكلفة ID', key: 'costCenterId', width: 15 },
    { header: 'المشرف ID', key: 'supervisorId', width: 15 },
    { header: 'معدل الراتب اليومي', key: 'dailyRate', width: 18 },
    { header: 'الراتب اليومي', key: 'dailyWage', width: 15 },
    { header: 'دقائق العمل', key: 'workMinutes', width: 15 },
    { header: 'معدل غرامة التأخير', key: 'latePenaltyRate', width: 18 },
    { header: 'معدل غرامة المغادرة المبكرة', key: 'earlyLeavePenaltyRate', width: 20 },
    { header: 'نشط', key: 'isActive', width: 10 },
    { header: 'تاريخ الإنشاء', key: 'createdAt', width: 18 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add data rows
  groups.forEach((group) => {
    worksheet.addRow({
      id: group.id,
      code: group.code,
      name: group.name,
      costCenterId: group.costCenterId,
      supervisorId: group.supervisorId,
      dailyRate: group.dailyRate,
      dailyWage: group.dailyWage,
      workMinutes: group.workMinutes,
      latePenaltyRate: group.latePenaltyRate,
      earlyLeavePenaltyRate: group.earlyLeavePenaltyRate,
      isActive: group.isActive ? 'نعم' : 'لا',
      createdAt: group.createdAt,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}

export async function generateWorkersExcelExport(workers: any[]): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('العمال');

  // Set column widths
  worksheet.columns = [
    { header: 'المعرف', key: 'id', width: 10 },
    { header: 'الكود', key: 'code', width: 15 },
    { header: 'الاسم الكامل', key: 'fullName', width: 25 },
    { header: 'رقم الهوية', key: 'nationalId', width: 20 },
    { header: 'الهاتف', key: 'phone', width: 15 },
    { header: 'معرف المجموعة', key: 'groupId', width: 15 },
    { header: 'معرف الوظيفة', key: 'jobId', width: 15 },
    { header: 'معدل الراتب اليومي', key: 'dailyRate', width: 18 },
    { header: 'الحالة', key: 'status', width: 15 },
    { header: 'تاريخ التوظيف', key: 'hireDate', width: 15 },
    { header: 'تاريخ الإنشاء', key: 'createdAt', width: 18 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Add data rows
  workers.forEach((worker) => {
    worksheet.addRow({
      id: worker.id,
      code: worker.code,
      fullName: worker.fullName,
      nationalId: worker.nationalId,
      phone: worker.phone,
      groupId: worker.groupId,
      jobId: worker.jobId,
      dailyRate: worker.dailyRate,
      status: worker.status,
      hireDate: worker.hireDate,
      createdAt: worker.createdAt,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
