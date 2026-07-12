import { describe, it, expect, beforeAll } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseGroupsFromExcel,
  parseWorkersFromExcel,
  generateGroupsExcelTemplate,
  generateWorkersExcelTemplate,
  generateGroupsExcelExport,
  generateWorkersExcelExport,
} from '../excelImportExport';

describe('Excel Import/Export', () => {
  describe('Template Generation', () => {
    it('should generate groups Excel template', async () => {
      const buffer = await generateGroupsExcelTemplate();
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      expect(workbook.worksheets[0].name).toBe('المجموعات');
    });

    it('should generate workers Excel template', async () => {
      const buffer = await generateWorkersExcelTemplate();
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      expect(workbook.worksheets[0].name).toBe('العمال');
    });
  });

  describe('Groups Import', () => {
    it('should parse valid groups from Excel', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('المجموعات');

      // Add header
      worksheet.columns = [
        { header: 'الكود', key: 'code', width: 15 },
        { header: 'الاسم', key: 'name', width: 25 },
      ];

      // Add data
      worksheet.addRow({ code: 'TECH', name: 'الفنيين' });
      worksheet.addRow({ code: 'ADMIN', name: 'الإداريين' });

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseGroupsFromExcel(buffer as any);

      expect(errors.length).toBe(0);
      expect(data.length).toBe(2);
      expect(data[0].code).toBe('TECH');
      expect(data[0].name).toBe('الفنيين');
      expect(data[1].code).toBe('ADMIN');
      expect(data[1].name).toBe('الإداريين');
    });

    it('should handle invalid group data', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('المجموعات');

      // Add header
      worksheet.columns = [
        { header: 'الكود', key: 'code', width: 15 },
        { header: 'الاسم', key: 'name', width: 25 },
      ];

      // Add invalid data (missing required fields)
      worksheet.addRow({ code: '', name: '' }); // Empty code and name

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseGroupsFromExcel(buffer as any);

      // Empty rows are skipped, so we expect no data and no errors
      expect(data.length).toBe(0);
    });

    it('should skip empty rows', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('المجموعات');

      // Add header
      worksheet.columns = [
        { header: 'الكود', key: 'code', width: 15 },
        { header: 'الاسم', key: 'name', width: 25 },
      ];

      // Add data with empty row
      worksheet.addRow({ code: 'TECH', name: 'الفنيين' });
      worksheet.addRow({}); // Empty row
      worksheet.addRow({ code: 'ADMIN', name: 'الإداريين' });

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseGroupsFromExcel(buffer as any);

      expect(errors.length).toBe(0);
      expect(data.length).toBeGreaterThanOrEqual(2); // Empty row should be skipped
    });
  });

  describe('Workers Import', () => {
    it('should parse valid workers from Excel', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('العمال');

      // Parser reads by column index: 1=code, 2=fullName, 3=nationalId, 4=phone, 5=groupCode
      worksheet.addRow(['الكود', 'الاسم الكامل', 'رقم الهوية', 'الهاتف', 'كود المجموعة']);
      worksheet.addRow(['W001', 'أحمد محمد', '1234567890', '0501111111', 'GRP001']);
      worksheet.addRow(['W002', 'فاطمة علي', '0987654321', '0502222222', 'GRP002']);

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseWorkersFromExcel(buffer as any);

      expect(data.length).toBe(2);
      expect(data[0].code).toBe('W001');
      expect(data[0].fullName).toBe('أحمد محمد');
      expect(data[1].code).toBe('W002');
      expect(data[1].fullName).toBe('فاطمة علي');
    });

    it('should handle invalid worker data', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('العمال');

      // Add header
      worksheet.columns = [
        { header: 'الكود', key: 'code', width: 15 },
        { header: 'الاسم الكامل', key: 'fullName', width: 25 },
      ];

      // Add invalid data (missing required fields)
      worksheet.addRow({ code: '', fullName: '' });

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseWorkersFromExcel(buffer as any);

      // Empty rows are skipped, so we expect no data and no errors
      expect(data.length).toBe(0);
    });

    it('should parse optional worker fields', async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('العمال');

      // Parser reads by column index: 1=code, 2=fullName, 3=nationalId, 4=phone, 5=groupCode
      worksheet.addRow(['الكود', 'الاسم الكامل', 'رقم الهوية', 'الهاتف', 'كود المجموعة']);
      worksheet.addRow(['W001', 'أحمد محمد', '1234567890', '0501234567', 'GRP001']);

      const buffer = await workbook.xlsx.writeBuffer();
      const { data, errors } = await parseWorkersFromExcel(buffer as any);

      expect(data.length).toBe(1);
      expect(data[0].phone).toBe('0501234567');
      expect(data[0].code).toBe('W001');
    });
  });

  describe('Export Functions', () => {
    it('should export groups to Excel', async () => {
      const mockGroups = [
        {
          id: 1,
          code: 'TECH',
          name: 'الفنيين',
          costCenterId: null,
          supervisorId: null,
          dailyRate: '100.00',
          dailyWage: '100.00',
          workMinutes: 480,
          latePenaltyRate: '5.00',
          earlyLeavePenaltyRate: '5.00',
          shiftStartTime: '08:00',
          shiftEndTime: '16:00',
          isActive: true,
          createdAt: new Date(),
        },
      ];

      const buffer = await generateGroupsExcelExport(mockGroups);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      expect(workbook.worksheets[0].name).toBe('المجموعات');
    });

    it('should export workers to Excel', async () => {
      const mockWorkers = [
        {
          id: 1,
          code: 'W001',
          fullName: 'أحمد محمد',
          nationalId: '1234567890',
          phone: '0501234567',
          groupId: 1,
          jobId: null,
          dailyRate: '100.00',
          status: 'active',
          hireDate: '2026-01-01',
          createdAt: new Date(),
        },
      ];

      const buffer = await generateWorkersExcelExport(mockWorkers);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      expect(workbook.worksheets[0].name).toBe('العمال');
    });

    it('should handle empty export data', async () => {
      const buffer = await generateGroupsExcelExport([]);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid Excel file with headers only
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
    });
  });
});
