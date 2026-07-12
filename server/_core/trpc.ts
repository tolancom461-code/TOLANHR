import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { UserRole } from "../../drizzle/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Admin procedure - requires super_admin role
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "هذا الإجراء متاح فقط للسوبر أدمن" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Role-based middleware factory
 * Creates a middleware that checks if the user has one of the allowed roles
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    const userRole = ctx.user.role as UserRole;
    
    // super_admin always passes
    if (userRole === 'super_admin') {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    if (!allowedRoles.includes(userRole)) {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `ليس لديك صلاحية لهذا الإجراء. الأدوار المسموحة: ${allowedRoles.join(', ')}` 
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

/**
 * Permission-based middleware factory
 * Checks a specific permission flag from ROLE_PERMISSIONS
 */
export function requirePermissionFlag(permissionKey: string) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    const userRole = ctx.user.role as UserRole;
    
    // super_admin always passes
    if (userRole === 'super_admin') {
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    // Dynamic import to avoid circular dependency
    const { ROLE_PERMISSIONS } = await import("../permissions");
    const perms = ROLE_PERMISSIONS[userRole];
    
    if (!perms || !(perms as any)[permissionKey]) {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: `ليس لديك صلاحية: ${permissionKey}` 
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

// DEPRECATED: These functions are kept for backward compatibility
// Use requireRole() or requirePermissionFlag() instead
export function hasPermission(user: any, permissionCode: string): boolean {
  // Delegate to role-based check
  if (!user || !user.role) return false;
  if (user.role === 'super_admin') return true;
  return false; // Default deny - use specific role checks
}

export function requirePermission(permissionCode: string) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    // Default deny for non-super_admin
    if (ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية لهذا الإجراء" });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}
