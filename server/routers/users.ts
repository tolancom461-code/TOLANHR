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

  // User Management
export const usersRouter = router({
    list: protectedProcedure.query(async () => {
      return await db.getAllUsers();
    }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getUserById(input.id);
      }),
    
    create: protectedProcedure
      .input(z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        fullName: z.string().min(2),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        phoneNumber: z.string().optional(),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const userRole = ctx.user.role as UserRole;
        if (userRole !== 'super_admin' && userRole !== 'admin_affairs') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية إنشاء مستخدمين' });
        }
        try {
          const id = await db.createLocalUser({
            username: input.username,
            password: input.password,
            fullName: input.fullName,
            email: input.email,
            phone: input.phoneNumber || input.phone,
            isActive: input.isActive,
          });
          // Audit log
          await db.logAudit({
            userId: ctx.user.id,
            action: 'CREATE_USER',
            tableName: 'users',
            recordId: (id as any).userId || 0,
            newValues: { username: input.username, fullName: input.fullName },
          });
          return { id, success: true };
        } catch (error: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'فشل إنشاء المستخدم',
          });
        }
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        fullName: z.string().min(2).optional(),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        phoneNumber: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
        password: z.string().min(6).optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        // Prevent user from deactivating themselves
        if (input.id === ctx.user.id && input.isActive === false) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تعطيل حسابك الخاص' });
        }
        const { id, password, phoneNumber, ...data } = input;
        const updateData: any = { ...data };
        if (phoneNumber !== undefined) {
          updateData.phone = phoneNumber;
        }
        // Hash password if provided
        const oldUser = await db.getUserById(id);
        if (password) {
          const bcrypt = await import('bcryptjs');
          const passwordHash = await bcrypt.hash(password, 10);
          await db.updateUser(id, { ...updateData, passwordHash });
        } else {
          await db.updateUser(id, updateData);
        }
        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'UPDATE_USER',
          tableName: 'users',
          recordId: id,
          oldValues: oldUser ? { fullName: oldUser.fullName, isActive: oldUser.isActive } : null,
          newValues: { ...updateData, passwordChanged: !!password },
        });
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        // Prevent user from deleting themselves
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك حذف حسابك الخاص' });
        }
        const oldUser = await db.getUserById(input.id);
        await db.deleteUser(input.id);
        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'DELETE_USER',
          tableName: 'users',
          recordId: input.id,
          oldValues: oldUser ? { username: oldUser.username, fullName: oldUser.fullName } : null,
        });
        return { success: true };
      }),
    
    // NOTE: Permissions Management removed - all users have full permissions
    
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['guard', 'supervisor_tolan', 'supervisor_malqa', 'admin_affairs', 'accountant', 'auditor', 'finance_manager', 'executive', 'super_admin', 'restaurant_operations']),
      }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        // Prevent changing own role
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تغيير دورك الخاص' });
        }
        const oldUser = await db.getUserById(input.userId);
        await db.updateUserRole(input.userId, input.role);
        // Audit log
        await db.logAudit({
          userId: ctx.user.id,
          action: 'UPDATE_USER_ROLE',
          tableName: 'users',
          recordId: input.userId,
          oldValues: oldUser ? { role: oldUser.role } : null,
          newValues: { role: input.role },
        });
        return { success: true };
      }),
    
    // Get available roles
    getRoles: protectedProcedure.query(async () => {
      return Object.entries(ROLE_PERMISSIONS).map(([value, perms]) => ({
        value,
        label: perms.label,
        labelAr: perms.labelAr,
      }));
    }),
    
    // Get user's permissions based on role
    getRolePermissions: protectedProcedure
      .input(z.object({ role: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const role = (input.role || ctx.user?.role || 'guard') as UserRole;
        return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.guard;
      }),
    
    // Assign cost centers to supervisor
    assignCostCenters: protectedProcedure
      .input(z.object({
        userId: z.number(),
        costCenterIds: z.array(z.number()),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
        const userRole = ctx.user.role as UserRole;
        if (userRole !== 'super_admin' && userRole !== 'admin_affairs') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'ليس لديك صلاحية تعيين مراكز التكلفة' });
        }
        await db.assignUserCostCenters(input.userId, input.costCenterIds);
        await db.logAudit({
          userId: ctx.user.id,
          action: 'ASSIGN_COST_CENTERS',
          tableName: 'users',
          recordId: input.userId,
          newValues: { costCenterIds: input.costCenterIds },
        });
        return { success: true };
      }),
    
    // Get user's assigned cost centers
    getUserCostCenters: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await db.getUserCostCenters(input.userId);
      }),
    
    // NOTE: assignRole removed - role system no longer exists
    
    // OLD PERMISSION PROCEDURES - REMOVED
    // Replaced with Atomic Permissions + Scope System
});
