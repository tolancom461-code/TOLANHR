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

  // Role Management
  // NOTE: roles and permissions routers have been removed.
  // All users are now treated as Admin with full access.
  // Restaurants Management (ميزة التشغيل وتكاليف المطاعم)
export const restaurantsRouter = router({
    currentWorkDate: protectedProcedure.query(async () => {
      return {
        workDate: db.getCurrentOperationalWorkDate(),
        controlStartDate: db.OPERATIONAL_DAY_CONTROL_START_DATE,
      };
    }),

    operationalDayStatus: protectedProcedure
      .input(z.object({ workDate: z.string(), costCenterId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getOperationalDayStatus(input.workDate, input.costCenterId, String(ctx.user.role), ctx.user.id);
      }),

    openOperationalDays: protectedProcedure
      .input(z.object({ costCenterId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getOpenOperationalDays(input.costCenterId, String(ctx.user.role), ctx.user.id);
      }),

    operationalRecords: protectedProcedure
      .input(z.object({ workDate: z.string(), costCenterId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getOperationalRecordsForDay(
          input.workDate,
          input.costCenterId,
          ctx.user.id,
          String(ctx.user.role)
        );
      }),

    operationalGroupWorkers: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getOperationalGroupWorkers(input.groupId, ctx.user.id, String(ctx.user.role));
      }),

    recordGroupCall: protectedProcedure
      .input(z.object({
        workDate: z.string(),
        costCenterId: z.number(),
        groupId: z.number(),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }))
      .use(requireRole('supervisor_tolan', 'supervisor_malqa', 'restaurant_operations'))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.createFinalOperationalRecord({
          workDate: input.workDate,
          costCenterId: input.costCenterId,
          type: 'group_called',
          time: input.time,
          groupId: input.groupId,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'RECORD_GROUP_CALL_TIME',
          tableName: 'operational_day_events',
          recordId: result.id,
          newValues: result,
        });
        return result;
      }),

    recordEmergencyCall: protectedProcedure
      .input(z.object({
        workDate: z.string(),
        costCenterId: z.number(),
        groupId: z.number(),
        workerId: z.number(),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        reason: z.string().trim().min(1).max(500),
      }))
      .use(requireRole('supervisor_tolan', 'supervisor_malqa', 'restaurant_operations'))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.createFinalOperationalRecord({
          workDate: input.workDate,
          costCenterId: input.costCenterId,
          type: 'emergency_called',
          time: input.time,
          groupId: input.groupId,
          workerId: input.workerId,
          note: input.reason,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'RECORD_EMERGENCY_CALL',
          tableName: 'operational_day_events',
          recordId: result.id,
          newValues: result,
        });
        return result;
      }),

    recordClosingTime: protectedProcedure
      .input(z.object({
        workDate: z.string(),
        costCenterId: z.number(),
        type: z.enum(['games_closed', 'restaurants_closed']),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }))
      .use(requireRole('super_admin', 'supervisor_tolan', 'supervisor_malqa'))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.createFinalOperationalRecord({
          workDate: input.workDate,
          costCenterId: input.costCenterId,
          type: input.type,
          time: input.time,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: input.type === 'games_closed' ? 'RECORD_GAMES_CLOSING_TIME' : 'RECORD_RESTAURANTS_CLOSING_TIME',
          tableName: 'operational_day_events',
          recordId: result.id,
          newValues: result,
        });
        return result;
      }),

    operationalRecordsReport: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        costCenterId: z.number().optional(),
        groupId: z.number().optional(),
        type: z.enum(['group_called', 'emergency_called', 'games_closed', 'restaurants_closed']).optional(),
      }))
      .use(requireRole('admin_affairs'))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.getOperationalRecordsReport({
          ...input,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'VIEW_OPERATIONAL_RECORDS_REPORT',
          tableName: 'operational_day_events',
          newValues: {
            startDate: input.startDate,
            endDate: input.endDate,
            costCenterId: input.costCenterId ?? null,
            groupId: input.groupId ?? null,
            type: input.type ?? null,
          },
        });
        return result;
      }),

    closeOperationalDay: protectedProcedure
      .input(z.object({
        workDate: z.string(),
        costCenterId: z.number(),
        acknowledgeChanges: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.closeOperationalDay({
          workDate: input.workDate,
          costCenterId: input.costCenterId,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
          acknowledgeChanges: input.acknowledgeChanges,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'CLOSE_OPERATIONAL_DAY',
          tableName: 'operational_days',
          newValues: { workDate: input.workDate, costCenterId: input.costCenterId, acknowledgeChanges: !!input.acknowledgeChanges },
        });
        return result;
      }),

    reopenOperationalDay: protectedProcedure
      .input(z.object({
        workDate: z.string(),
        costCenterId: z.number(),
        reason: z.string().trim().min(1).max(500),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        const result = await db.reopenOperationalDay({
          workDate: input.workDate,
          costCenterId: input.costCenterId,
          actorUserId: ctx.user.id,
          actorRole: String(ctx.user.role),
          reason: input.reason,
        });
        await db.logAudit({
          userId: ctx.user.id,
          action: 'REOPEN_OPERATIONAL_DAY',
          tableName: 'operational_days',
          newValues: { workDate: input.workDate, costCenterId: input.costCenterId, reason: input.reason },
        });
        return result;
      }),

    list: protectedProcedure
      .input(z.object({
        includeInactive: z.boolean().optional(),
        costCenterId: z.number().optional(),
      }).optional())
      .query(async ({ input }) => {
        return await db.getAllRestaurants(input?.includeInactive || false, input?.costCenterId);
      }),

    departments: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .use(requireRole('super_admin', 'admin_affairs'))
      .query(async ({ input }) => {
        return await db.getAllOperationalDepartments(input?.includeInactive || false);
      }),

    createDepartment: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1) }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createOperationalDepartment(input.name);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'CREATE_OPERATIONAL_DEPARTMENT',
          tableName: 'operational_departments',
          recordId: Number(result.id) || null,
          newValues: { id: result.id, name: result.name },
        });
        return result;
      }),

    updateDepartment: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().trim().min(1).optional(),
        isActive: z.boolean().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const before = (await db.getAllOperationalDepartments(true)).find((row: any) => row.id === input.id) || null;
        const result = await db.updateOperationalDepartment(input.id, {
          name: input.name,
          isActive: input.isActive,
        });
        const after = (await db.getAllOperationalDepartments(true)).find((row: any) => row.id === input.id) || null;
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'UPDATE_OPERATIONAL_DEPARTMENT',
          tableName: 'operational_departments',
          recordId: input.id,
          oldValues: before,
          newValues: after,
        });
        return result;
      }),

    deleteDepartment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const before = (await db.getAllOperationalDepartments(true)).find((row: any) => row.id === input.id) || null;
        const result = await db.deleteOperationalDepartment(input.id);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'DELETE_OPERATIONAL_DEPARTMENT',
          tableName: 'operational_departments',
          recordId: input.id,
          oldValues: before,
          newValues: { deleted: true },
        });
        return result;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(1),
        costCenterId: z.number().nullable().optional(),
        operationalDepartmentId: z.number().nullable().optional(),
        siteType: z.enum(['restaurant', 'site']).default('site'),
      }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const result = await db.createRestaurant(input);
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'CREATE_OPERATIONAL_SITE',
          tableName: 'restaurants',
          recordId: Number(result.id) || null,
          newValues: {
            id: result.id,
            name: result.name,
            costCenterId: input.costCenterId ?? null,
            operationalDepartmentId: input.operationalDepartmentId ?? null,
            siteType: input.siteType,
          },
        });
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().trim().min(1).optional(),
        costCenterId: z.number().nullable().optional(),
        operationalDepartmentId: z.number().nullable().optional(),
        siteType: z.enum(['restaurant', 'site']).optional(),
        isActive: z.boolean().optional(),
      }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const before = (await db.getAllRestaurants(true)).find((row: any) => row.id === input.id) || null;
        const result = await db.updateRestaurant(input.id, {
          name: input.name,
          costCenterId: input.costCenterId,
          operationalDepartmentId: input.operationalDepartmentId,
          siteType: input.siteType,
          isActive: input.isActive,
        });
        const after = (await db.getAllRestaurants(true)).find((row: any) => row.id === input.id) || null;
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'UPDATE_OPERATIONAL_SITE',
          tableName: 'restaurants',
          recordId: input.id,
          oldValues: before,
          newValues: after,
        });
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .use(requireRole('super_admin', 'admin_affairs'))
      .mutation(async ({ input, ctx }) => {
        const before = (await db.getAllRestaurants(true)).find((row: any) => row.id === input.id) || null;
        const result = await db.deleteRestaurant(input.id);
        const after = result.softDeleted
          ? (await db.getAllRestaurants(true)).find((row: any) => row.id === input.id) || null
          : null;
        await db.logAudit({
          userId: ctx.user?.id,
          action: result.softDeleted ? 'DEACTIVATE_OPERATIONAL_SITE' : 'DELETE_OPERATIONAL_SITE',
          tableName: 'restaurants',
          recordId: input.id,
          oldValues: before,
          newValues: result.softDeleted ? after : { deleted: true },
        });
        return result;
      }),

    // صفحة التشغيل: الحاضرون فقط مع قرار التشغيل اليومي.
    getWorkersForAssignment: protectedProcedure
      .input(z.object({ groupId: z.number(), workDate: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getWorkersWithAssignmentForGroupDate(
          input.groupId,
          input.workDate,
          ctx.user.id,
          String(ctx.user.role)
        );
      }),

    // بطاقات المجموعات السريعة لموظف التشغيل: عدد الحاضرين وما تم توزيعه.
    groupAssignmentProgress: protectedProcedure
      .input(z.object({ costCenterId: z.number(), workDate: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.getGroupAssignmentProgressForCostCenterDate(
          input.costCenterId,
          input.workDate,
          ctx.user.id,
          String(ctx.user.role)
        );
      }),

    // حفظ قرار التشغيل: الموقع + نقل المجموعة عند الحاجة. المرحلة الأولى لا تعدل الدفعات.
    assignWorker: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        restaurantId: z.number().nullable().optional(),
        sourceGroupId: z.number(),
        operationalGroupId: z.number().nullable().optional(),
        workDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.upsertDailyWorkAssignment({
          workerId: input.workerId,
          restaurantId: input.restaurantId,
          sourceGroupId: input.sourceGroupId,
          operationalGroupId: input.operationalGroupId,
          workDate: input.workDate,
          assignedBy: ctx.user.id,
          actorRole: String(ctx.user.role),
        });
      }),

    removeAssignment: protectedProcedure
      .input(z.object({ workerId: z.number(), workDate: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error('Not authenticated');
        return await db.removeDailyWorkAssignment(
          input.workerId,
          input.workDate,
          ctx.user.id,
          String(ctx.user.role)
        );
      }),

    // تقارير التشغيل المالية: المصدر المالي هو الدفعات المعتمدة/المدفوعة فقط.
    costReport: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        siteCostCenterId: z.number().optional(),
        sourceGroupId: z.number().optional(),
        siteId: z.number().optional(),
        workerId: z.number().optional(),
      }))
      .use(requireRole('admin_affairs', 'accountant', 'operations_cost_accountant'))
      .query(async ({ input, ctx }) => {
        if (input.startDate > input.endDate) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');
        const result = await db.getRestaurantCostReport(input.startDate, input.endDate, {
          siteCostCenterId: input.siteCostCenterId,
          sourceGroupId: input.sourceGroupId,
          siteId: input.siteId,
          workerId: input.workerId,
        });
        await db.logAudit({
          userId: ctx.user?.id,
          action: 'VIEW_OPERATIONAL_COST_REPORT',
          tableName: 'operations_cost_report',
          newValues: {
            startDate: input.startDate,
            endDate: input.endDate,
            siteCostCenterId: input.siteCostCenterId ?? null,
            sourceGroupId: input.sourceGroupId ?? null,
            siteId: input.siteId ?? null,
            workerId: input.workerId ?? null,
          },
        });
        return result;
      }),
});

