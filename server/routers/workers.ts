import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router, requireRole, requirePermissionFlag } from "../_core/trpc";
import * as db from "../db";
import { sql, and, eq, gte, desc } from "drizzle-orm";
import { attendanceEvents, type UserRole } from "../../drizzle/schema";
import { ROLE_PERMISSIONS, hasPageAccess, canApproveBatchAtStage, cannotSelfReview } from "../permissions";
import { generateAttendanceExcel, generatePayrollExcel, type AttendanceReportRow, type PayrollReportRow } from "../excelExport";
import { parseGroupsFromExcel, parseWorkersFromExcel, generateGroupsExcelTemplate, generateWorkersExcelTemplate, generateGroupsExcelExport, generateWorkersExcelExport } from "../excelImportExport";
import * as analytics from "../analytics";
import { sendNotification } from "../notifications";
import * as QRCode from "qrcode";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";

  // Workers Management
export const workersRouter = router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getAllWorkers();
      }),
    
    listWithPagination: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
        groupId: z.number().optional(),
        searchQuery: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getWorkersWithPagination(input.page, input.limit, input.groupId, input.searchQuery);
      }),
    
    listByGroup: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWorkersByGroup(input.groupId);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getWorkerById(input.id);
      }),
    
    getByCode: protectedProcedure
      .input(z.object({ code: z.string() }))
      .query(async ({ input }) => {
        return await db.getWorkerByCode(input.code);
      }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().min(1),
        fullName: z.string().min(2),
        nationalId: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        groupId: z.number().optional().nullable(),
        jobId: z.number().optional().nullable(),
        dailyRate: z.string().optional(),
        photoUrl: z.string().optional().nullable(),
        hireDate: z.string().optional().nullable(),
        status: z.enum(["active", "inactive", "archived"]).default("active"),
      }))
      .use(requirePermissionFlag('canManageWorkers'))
      .mutation(async ({ input, ctx }) => {
        try {
          // Generate QR token
          const qrToken = `WRK-${input.code}-${Date.now()}`;
          const manualCode = input.code.toUpperCase();
          
          const id = await db.createWorker({
            ...input,
            qrToken,
            manualCode,
            hireDate: input.hireDate ? new Date(input.hireDate) : null,
          });
          // Audit log
          await db.logAudit({
            userId: ctx.user?.id,
            action: 'CREATE_WORKER',
            tableName: 'workers',
            recordId: id,
            newValues: { code: input.code, fullName: input.fullName, groupId: input.groupId },
          });
          return { id, qrToken, success: true };
        } catch (error: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'فشل إنشاء العامل',
          });
        }
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).optional(),
        fullName: z.string().min(2).optional(),
        nationalId: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        groupId: z.number().optional().nullable(),
        jobId: z.number().optional().nullable(),
        dailyRate: z.string().optional(),
        photoUrl: z.string().optional().nullable(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
      }))
      .use(requirePermissionFlag('canManageWorkers'))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const oldWorker = await db.getWorkerById(id);
        await db.updateWorker(id, data);
        // Audit log
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'UPDATE_WORKER',
          tableName: 'workers',
          recordId: id,
          oldValues: oldWorker ? { code: oldWorker.code, fullName: oldWorker.fullName, status: oldWorker.status } : null,
          newValues: data,
        });
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requirePermissionFlag('canManageWorkers'))
      .mutation(async ({ input, ctx }) => {
        const oldWorker = await db.getWorkerById(input.id);
        await db.deleteWorker(input.id);
        // Audit log
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'DELETE_WORKER',
          tableName: 'workers',
          recordId: input.id,
          oldValues: oldWorker ? { code: oldWorker.code, fullName: oldWorker.fullName } : null,
        });
        return { success: true };
      }),
    
    regenerateQR: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const worker = await db.getWorkerById(input.id);
        if (!worker) throw new Error("Worker not found");
        
        const qrToken = `WRK-${worker.code}-${Date.now()}`;
        await db.updateWorker(input.id, { qrToken });
        return { qrToken, success: true };
      }),
    
    getAttendance: protectedProcedure
      .input(z.object({ workerId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getWorkerAttendance(input.workerId, input.limit || 30);
      }),
    
    getFinanceSummary: protectedProcedure
      .input(z.object({ workerId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWorkerFinanceSummary(input.workerId);
      }),
    
    getPayOverrides: protectedProcedure
      .input(z.object({ workerId: z.number() }))
      .query(async ({ input }) => {
        return await db.getWorkerPayOverrides(input.workerId);
      }),
    
    // Export single worker QR Code to PDF
    exportWorkerQRCode: protectedProcedure
      .input(z.object({ workerId: z.number() }))
      .mutation(async ({ input }) => {
        const worker = await db.getWorkerById(input.workerId);
        
        if (!worker) {
          throw new Error('Worker not found');
        }
        
        if (!worker.qrToken) {
          throw new Error('Worker QR token not found');
        }
        
        // Generate QR Code as data URL
        const qrDataUrl = await QRCode.toDataURL(worker.qrToken, {
          width: 300,
          margin: 2,
        });
        
        // Create PDF (simple layout: code + QR only)
        const doc = new PDFDocument({ size: 'A6', margin: 20 });
        const chunks: Buffer[] = [];
        
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        
        await new Promise<void>((resolve) => {
          doc.on('end', () => resolve());
          
          // Add worker code at top
          doc.fontSize(24).text(worker.code || worker.manualCode || 'N/A', { align: 'center' });
          doc.moveDown(2);
          
          // Add QR Code (centered)
          const qrImage = Buffer.from(qrDataUrl.split(',')[1], 'base64');
          doc.image(qrImage, {
            fit: [250, 250],
            align: 'center',
          });
          
          doc.end();
        });
        
        const pdfBuffer = Buffer.concat(chunks);
        
        return {
          filename: `worker_${worker.manualCode}_qr.pdf`,
          data: pdfBuffer.toString('base64'),
        };
      }),
    
    // Export all workers QR Codes in a group to PDF
    exportGroupQRCodes: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(async ({ input }) => {
        const workers = await db.getWorkersByGroup(input.groupId);
        
        if (!workers || workers.length === 0) {
          throw new Error('No workers found in this group');
        }
        
        // Get group name
        const group = await db.getGroupById(input.groupId);
        const groupName = group?.name || 'مجموعة';
        
        // Create PDF (simple layout: code + QR only)
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];
        
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        
        await new Promise<void>(async (resolve) => {
          doc.on('end', () => resolve());
          
          // Add each worker (3 per page)
          for (let i = 0; i < workers.length; i++) {
            const worker = workers[i];
            
            // Skip workers without QR token
            if (!worker.qrToken) {
              continue;
            }
            
            // Add page break after every 3 workers (except first)
            if (i > 0 && i % 3 === 0) {
              doc.addPage();
            }
            
            // Generate QR Code
            const qrDataUrl = await QRCode.toDataURL(worker.qrToken, {
              width: 200,
              margin: 1,
            });
            
            // Worker code at top
            doc.fontSize(18).text(worker.code || worker.manualCode || 'N/A', { align: 'center' });
            doc.moveDown(1);
            
            // Add QR Code
            const qrImage = Buffer.from(qrDataUrl.split(',')[1], 'base64');
            doc.image(qrImage, {
              fit: [180, 180],
              align: 'center',
            });
            
            doc.moveDown(2);
            
            // Add separator line
            if (i < workers.length - 1 && (i + 1) % 3 !== 0) {
              doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
              doc.moveDown();
            }
          }
          
          doc.end();
        });
        
        const pdfBuffer = Buffer.concat(chunks);
        
        return {
          filename: `group_${groupName}_qr_codes.pdf`,
          data: pdfBuffer.toString('base64'),
        };
      }),
});
