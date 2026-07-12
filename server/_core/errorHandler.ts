import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * موحد معالجة الأخطاء
 * Unified Error Handler
 */

export enum ErrorCode {
  // Validation Errors
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  SESSION_EXPIRED = "SESSION_EXPIRED",
  
  // Resource Errors
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  CONFLICT = "CONFLICT",
  
  // Database Errors
  DATABASE_ERROR = "DATABASE_ERROR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",
  
  // Business Logic Errors
  BUSINESS_LOGIC_ERROR = "BUSINESS_LOGIC_ERROR",
  INVALID_STATE = "INVALID_STATE",
  OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",
  
  // Server Errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
}

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

/**
 * تحويل الأخطاء إلى TRPC errors موحدة
 * Convert errors to unified TRPC errors
 */
export function handleError(error: unknown): TRPCError {
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const fieldErrors = (error as any).errors.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'خطأ في التحقق من البيانات',
      cause: {
        code: ErrorCode.VALIDATION_ERROR,
        errors: fieldErrors,
      },
    });
  }
  
  // Handle TRPC errors
  if (error instanceof TRPCError) {
    return error;
  }
  
  // Handle standard errors
  if (error instanceof Error) {
    const message = error.message || 'حدث خطأ غير متوقع';
    
    // Database errors
    if (message.includes('database') || message.includes('Database')) {
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'خطأ في قاعدة البيانات',
        cause: {
          code: ErrorCode.DATABASE_ERROR,
          originalError: message,
        },
      });
    }
    
    // Generic error
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message,
      cause: {
        code: ErrorCode.INTERNAL_ERROR,
      },
    });
  }
  
  // Unknown error
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'حدث خطأ غير متوقع',
    cause: {
      code: ErrorCode.INTERNAL_ERROR,
      error,
    },
  });
}

/**
 * تسجيل الأخطاء
 * Log errors
 */
export async function logError(
  error: unknown,
  context: {
    userId?: number;
    procedure?: string;
    input?: any;
  }
): Promise<void> {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  console.error(`[${timestamp}] Error in ${context.procedure || 'unknown'}:`, {
    userId: context.userId,
    message: errorMessage,
    input: context.input,
    stack: error instanceof Error ? error.stack : undefined,
  });
  
  // TODO: Send to error tracking service (Sentry, etc.)
}

/**
 * التحقق من الصلاحيات
 * Check permissions
 */
export function checkPermission(userRole: string, requiredRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'admin': 100,
    'financial_manager': 80,
    'accountant': 60,
    'hr_manager': 50,
    'supervisor': 30,
    'user': 10,
  };
  
  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
}

/**
 * معالج الأخطاء للـ async functions
 * Async error handler wrapper
 */
export function asyncHandler(fn: Function) {
  return async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw handleError(error);
    }
  };
}
