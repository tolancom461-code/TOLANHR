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

export const authRouter = router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      
      // Verify user still exists and is active
      const currentUser = await db.getUserById(ctx.user.id);
      
      if (!currentUser || !currentUser.isActive) {
        return null; // User deleted or deactivated
      }
      
      return currentUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    permissions: protectedProcedure.query(async ({ ctx }) => {
      // Old permission system removed
      // Use scopedPermissions router for the new atomic permissions system
      return [];
    }),
    localLogin: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        rememberMe: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.authenticateLocalUser(input.username, input.password);
        
        if (!user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'اسم المستخدم أو كلمة السر غير صحيحة',
          });
        }
        
        if (!user.isActive) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'هذا الحساب غير نشط',
          });
        }
        
        // Create session - MUST have JWT_SECRET configured
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          console.error('[SECURITY] JWT_SECRET is not configured!');
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'خطأ في إعدادات النظام' });
        }
        const expiresIn = input.rememberMe ? '30d' : '1d';
        const token = jwt.sign(
          { userId: user.id, username: user.username },
          jwtSecret,
          { expiresIn }
        );
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        const maxAge = input.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge });
        
        return { success: true, user };
      }),
});
