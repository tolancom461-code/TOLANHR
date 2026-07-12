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

  // Groups Management
export const groupsRouter = router({
    list: protectedProcedure.query(async () => {
      // All users have access to all groups (no permission system)
      return await db.getAllGroups();
    }),
    
    listByCostCenter: protectedProcedure
      .input(z.object({
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        // If no costCenterId provided, return all groups
        if (!input.costCenterId) {
          return await db.getAllGroups();
        }
        // Otherwise, return only groups for that cost center
        return await db.getGroupsByCostCenter(input.costCenterId);
      }),
    
    listWithPagination: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
        costCenterId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getGroupsWithPagination(input.page, input.limit, input.costCenterId);
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getGroupById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        code: z.string().min(1),
        name: z.string().min(2),
        costCenterId: z.number().optional().nullable(),
        supervisorId: z.number().optional().nullable(),
        dailyRate: z.string().optional(),
        dailyWage: z.string().optional().nullable(),
        workMinutes: z.string().optional().nullable(),
        latePenaltyRate: z.string().optional().nullable(),
        earlyLeavePenaltyRate: z.string().optional().nullable(),
        isFlexibleSchedule: z.boolean().default(false),
        requiredHours: z.string().optional().nullable(),
        isActive: z.boolean().default(true),
      }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input, ctx }) => {
        try {
          const id = await db.createGroup({
            code: input.code,
            name: input.name,
            costCenterId: input.costCenterId,
            supervisorId: input.supervisorId,
            dailyRate: input.dailyRate,
            dailyWage: input.dailyWage ? parseFloat(input.dailyWage) : null,
            workMinutes: input.workMinutes ? parseInt(input.workMinutes) : null,
            latePenaltyRate: input.latePenaltyRate ? parseFloat(input.latePenaltyRate) : null,
            earlyLeavePenaltyRate: input.earlyLeavePenaltyRate ? parseFloat(input.earlyLeavePenaltyRate) : null,
            isFlexibleSchedule: input.isFlexibleSchedule,
            requiredHours: input.requiredHours ? parseFloat(input.requiredHours) : null,
            isActive: input.isActive,
          } as any);
          // Audit log
          await db.logAudit({
            userId: ctx.user?.id,
            action: 'CREATE_GROUP',
            tableName: 'groups',
            recordId: id,
            newValues: { code: input.code, name: input.name },
          });
          return { id, success: true };
        } catch (error: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'فشل إنشاء المجموعة',
          });
        }
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        code: z.string().min(1).optional(),
        name: z.string().min(2).optional(),
        costCenterId: z.number().optional().nullable(),
        supervisorId: z.number().optional().nullable(),
        dailyRate: z.string().optional(),
        dailyWage: z.string().optional().nullable(),
        workMinutes: z.string().optional().nullable(),
        latePenaltyRate: z.string().optional().nullable(),
        earlyLeavePenaltyRate: z.string().optional().nullable(),
        isFlexibleSchedule: z.boolean().optional(),
        requiredHours: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
      }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const updateData: any = {};
        
        if (data.code !== undefined) updateData.code = data.code;
        if (data.name !== undefined) updateData.name = data.name;
        if (data.costCenterId !== undefined) updateData.costCenterId = data.costCenterId;
        if (data.supervisorId !== undefined) updateData.supervisorId = data.supervisorId;
        if (data.dailyRate !== undefined) updateData.dailyRate = data.dailyRate;
        if (data.dailyWage !== undefined) updateData.dailyWage = data.dailyWage ? parseFloat(data.dailyWage) : null;
        if (data.workMinutes !== undefined) updateData.workMinutes = data.workMinutes ? parseInt(data.workMinutes) : null;
        if (data.latePenaltyRate !== undefined) updateData.latePenaltyRate = data.latePenaltyRate ? parseFloat(data.latePenaltyRate) : null;
        if (data.earlyLeavePenaltyRate !== undefined) updateData.earlyLeavePenaltyRate = data.earlyLeavePenaltyRate ? parseFloat(data.earlyLeavePenaltyRate) : null;
        if (data.isFlexibleSchedule !== undefined) updateData.isFlexibleSchedule = data.isFlexibleSchedule;
        if (data.requiredHours !== undefined) updateData.requiredHours = data.requiredHours ? parseFloat(data.requiredHours) : null;
        if (data.isActive !== undefined) updateData.isActive = data.isActive;
        
        const oldGroup = await db.getGroupById(id);
        await db.updateGroup(id, updateData);
        // Audit log
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'UPDATE_GROUP',
          tableName: 'groups',
          recordId: id,
          oldValues: oldGroup ? { code: oldGroup.code, name: oldGroup.name } : null,
          newValues: updateData,
        });
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requirePermissionFlag('canManageGroups'))
      .mutation(async ({ input, ctx }) => {
        const oldGroup = await db.getGroupById(input.id);
        await db.deleteGroup(input.id);
        // Audit log
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'DELETE_GROUP',
          tableName: 'groups',
          recordId: input.id,
          oldValues: oldGroup ? { code: oldGroup.code, name: oldGroup.name } : null,
        });
        return { success: true };
      }),
    
    // Shifts procedures removed - using Weekly Schedules instead
    
    listWithoutSchedules: protectedProcedure.query(async () => {
      return await db.getGroupsWithoutSchedules();
    }),
    
    checkHasSchedules: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return await db.checkGroupHasSchedules(input.groupId);
      }),
});
