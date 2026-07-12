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
    list: protectedProcedure
      .input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        return await db.getAllRestaurants(input?.includeInactive || false);
      }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(1) }))
      .mutation(async ({ input }) => {
        return await db.createRestaurant(input.name);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.updateRestaurant(input.id, {
          name: input.name,
          isActive: input.isActive,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await db.deleteRestaurant(input.id);
      }),

    // صفحة "التشغيل": عمال مجموعة معينة مع تعيينهم الحالي لتاريخ معين
    getWorkersForAssignment: protectedProcedure
      .input(z.object({ groupId: z.number(), workDate: z.string() }))
      .query(async ({ input }) => {
        return await db.getWorkersWithAssignmentForGroupDate(input.groupId, input.workDate);
      }),

    // حفظ/تحديث تعيين عامل لمطعم في تاريخ معين
    assignWorker: protectedProcedure
      .input(z.object({
        workerId: z.number(),
        restaurantId: z.number(),
        workDate: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        return await db.upsertDailyWorkAssignment({
          workerId: input.workerId,
          restaurantId: input.restaurantId,
          workDate: input.workDate,
          assignedBy: ctx.user.id,
        });
      }),

    // إزالة تعيين عامل من مطعم في تاريخ معين
    removeAssignment: protectedProcedure
      .input(z.object({ workerId: z.number(), workDate: z.string() }))
      .mutation(async ({ input }) => {
        return await db.removeDailyWorkAssignment(input.workerId, input.workDate);
      }),

    // تقرير تكاليف المطاعم لفترة معينة
    costReport: protectedProcedure
      .input(z.object({ startDate: z.string(), endDate: z.string() }))
      .query(async ({ input }) => {
        return await db.getRestaurantCostReport(input.startDate, input.endDate);
      }),
});
