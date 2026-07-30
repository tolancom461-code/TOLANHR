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
          const newUserId = (id as any).userId || 0;

          const database = await db.getDb();
          if (database) {
            await database.transaction(async (tx: any) => {
              await db.logAudit({
                userId: ctx.user!.id,
                action: 'CREATE_USER',
                tableName: 'users',
                recordId: newUserId,
                newValues: { username: input.username, fullName: input.fullName },
                tx,
              });
              await db.logAuditV2({
                actionCategory: 'CREATE',
                actionName: 'CREATE_USER',
                description: `${ctx.user!.fullName || ctx.user!.username} قام بإنشاء المستخدم ${input.fullName} (${input.username})`,
                tableName: 'users',
                entityType: 'user',
                recordId: newUserId,
                recordKey: { username: input.username },
                actor: db.actorFromUser(ctx.user),
                source: 'WEB',
                req: ctx.req,
                requestId: ctx.requestId,
                afterValues: { username: input.username, fullName: input.fullName, email: input.email, phone: input.phoneNumber || input.phone, isActive: input.isActive },
                recordCreatedAt: new Date().toISOString(),
                tx,
              });
            });
          }
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
        const passwordChanged = !!password;
        if (password) {
          const bcrypt = await import('bcryptjs');
          const passwordHash = await bcrypt.hash(password, 10);
          await db.updateUser(id, { ...updateData, passwordHash });
        } else {
          await db.updateUser(id, updateData);
        }

        const database = await db.getDb();
        if (database) {
          await database.transaction(async (tx: any) => {
            await db.logAudit({
              userId: ctx.user!.id,
              action: 'UPDATE_USER',
              tableName: 'users',
              recordId: id,
              oldValues: oldUser ? { fullName: oldUser.fullName, isActive: oldUser.isActive } : null,
              newValues: { ...updateData, passwordChanged },
              tx,
            });

            const beforeSnapshot = oldUser
              ? { fullName: oldUser.fullName, email: oldUser.email, phone: oldUser.phone, isActive: oldUser.isActive }
              : null;
            const afterSnapshot = { ...updateData };
            // لا نُدرج كلمة المرور نفسها إطلاقاً بأي لقطة — فقط علم أنها تغيّرت
            const changedFields = db.diffChangedFields(beforeSnapshot, afterSnapshot);
            const finalChangedFields = passwordChanged
              ? { ...(changedFields || {}), password: { old: '***', new: '***' } }
              : changedFields;

            await db.logAuditV2({
              actionCategory: 'UPDATE',
              actionName: 'UPDATE_USER',
              description: `${ctx.user!.fullName || ctx.user!.username} قام بتعديل بيانات المستخدم ${oldUser?.fullName || id}${passwordChanged ? ' (تضمّن تغيير كلمة المرور)' : ''}`,
              tableName: 'users',
              entityType: 'user',
              recordId: id,
              recordKey: { username: oldUser?.username ?? null },
              actor: db.actorFromUser(ctx.user),
              source: 'WEB',
              req: ctx.req,
              requestId: ctx.requestId,
              beforeValues: beforeSnapshot,
              afterValues: afterSnapshot,
              changedFields: finalChangedFields,
              recordUpdatedAt: new Date().toISOString(),
              tx,
            });
          });
        }
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
        // سبب الحذف إلزامي (FR-008 / DELETE_USER عملية حساسة) — الواجهة مُحدَّثة لطلبه.
        reason: z.string().min(1, 'سبب حذف المستخدم إلزامي'),
      }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        // Prevent user from deleting themselves
        if (input.id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك حذف حسابك الخاص' });
        }
        const oldUser = await db.getUserById(input.id);
        if (!oldUser) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'المستخدم غير موجود' });
        }

        const database = await db.getDb();
        if (!database) throw new Error('Database not available');

        await database.transaction(async (tx: any) => {
          await db.deleteUser(input.id, tx);

          await db.logAudit({
            userId: ctx.user!.id,
            action: 'DELETE_USER',
            tableName: 'users',
            recordId: input.id,
            oldValues: { username: oldUser.username, fullName: oldUser.fullName },
            tx,
          });

          await db.logAuditV2({
            actionCategory: 'DELETE',
            actionName: 'DELETE_USER',
            description: `${ctx.user!.fullName || ctx.user!.username} قام بحذف المستخدم ${oldUser.fullName} (${oldUser.username}) - السبب: ${input.reason}`,
            tableName: 'users',
            entityType: 'user',
            recordId: input.id,
            recordKey: { username: oldUser.username },
            actor: db.actorFromUser(ctx.user),
            source: 'WEB',
            req: ctx.req,
            requestId: ctx.requestId,
            beforeValues: { username: oldUser.username, fullName: oldUser.fullName, email: oldUser.email, phone: oldUser.phone, role: oldUser.role, isActive: oldUser.isActive },
            afterValues: null,
            reasonText: input.reason,
            recordDeletedAt: new Date().toISOString(),
            tx,
          });
        });
        return { success: true };
      }),
    
    // NOTE: Permissions Management removed - all users have full permissions
    
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['guard', 'supervisor_tolan', 'supervisor_malqa', 'admin_affairs', 'accountant', 'auditor', 'finance_manager', 'executive', 'super_admin', 'restaurant_operations', 'data_entry']),
        // سبب تغيير الدور إلزامي — CHANGE_ROLE ضمن قسم 4 بالوثيقة (نعم دائماً).
        reason: z.string().min(1, 'سبب تغيير دور المستخدم إلزامي'),
      }))
      .use(requireRole('super_admin'))
      .mutation(async ({ input, ctx }) => {
        // Prevent changing own role
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك تغيير دورك الخاص' });
        }
        const oldUser = await db.getUserById(input.userId);

        const database = await db.getDb();
        if (!database) throw new Error('Database not available');

        await database.transaction(async (tx: any) => {
          await db.updateUserRole(input.userId, input.role, tx);

          await db.logAudit({
            userId: ctx.user!.id,
            action: 'UPDATE_USER_ROLE',
            tableName: 'users',
            recordId: input.userId,
            oldValues: oldUser ? { role: oldUser.role } : null,
            newValues: { role: input.role },
            tx,
          });

          await db.logAuditV2({
            actionCategory: 'CHANGE_ROLE',
            actionName: 'UPDATE_USER_ROLE',
            description: `${ctx.user!.fullName || ctx.user!.username} قام بتغيير دور المستخدم ${oldUser?.fullName || input.userId} من "${oldUser?.role || '-'}" إلى "${input.role}" - السبب: ${input.reason}`,
            tableName: 'users',
            entityType: 'user',
            recordId: input.userId,
            recordKey: { username: oldUser?.username ?? null },
            actor: db.actorFromUser(ctx.user),
            source: 'WEB',
            req: ctx.req,
            requestId: ctx.requestId,
            beforeValues: oldUser ? { role: oldUser.role } : null,
            afterValues: { role: input.role },
            changedFields: { role: { old: oldUser?.role ?? null, new: input.role } },
            reasonText: input.reason,
            recordUpdatedAt: new Date().toISOString(),
            tx,
          });
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

        const oldCostCenterIds = await db.getUserCostCenterIds(input.userId);
        const targetUser = await db.getUserById(input.userId);

        const database = await db.getDb();
        if (!database) throw new Error('Database not available');

        await database.transaction(async (tx: any) => {
          await db.assignUserCostCenters(input.userId, input.costCenterIds, tx);

          await db.logAudit({
            userId: ctx.user!.id,
            action: 'ASSIGN_COST_CENTERS',
            tableName: 'users',
            recordId: input.userId,
            newValues: { costCenterIds: input.costCenterIds },
            tx,
          });

          await db.logAuditV2({
            actionCategory: 'ASSIGN',
            actionName: 'ASSIGN_COST_CENTERS',
            description: `${ctx.user!.fullName || ctx.user!.username} قام بتعيين ${input.costCenterIds.length} مركز تكلفة للمستخدم ${targetUser?.fullName || input.userId}`,
            tableName: 'users',
            entityType: 'user',
            recordId: input.userId,
            recordKey: { username: targetUser?.username ?? null },
            actor: db.actorFromUser(ctx.user),
            source: 'WEB',
            req: ctx.req,
            requestId: ctx.requestId,
            beforeValues: { costCenterIds: oldCostCenterIds },
            afterValues: { costCenterIds: input.costCenterIds },
            changedFields: { costCenterIds: { old: oldCostCenterIds, new: input.costCenterIds } },
            recordUpdatedAt: new Date().toISOString(),
            tx,
          });
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
