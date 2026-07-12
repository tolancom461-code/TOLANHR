import { TRPCError } from '@trpc/server';

/**
 * Custom error handling utilities for procedures
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string | number) {
    super(`${resource} with ID ${id} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Convert custom errors to TRPC errors
 */
export function handleError(error: unknown): TRPCError {
  if (error instanceof ValidationError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }

  if (error instanceof NotFoundError) {
    return new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ConflictError) {
    return new TRPCError({
      code: 'CONFLICT',
      message: error.message,
    });
  }

  if (error instanceof UnauthorizedError) {
    return new TRPCError({
      code: 'UNAUTHORIZED',
      message: error.message,
    });
  }

  if (error instanceof Error) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unknown error occurred',
  });
}

/**
 * Validate required fields
 */
export function validateRequired(data: Record<string, any>, fields: string[]): void {
  const missing = fields.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Validate email format
 */
export function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function validateDateFormat(date: string): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    throw new ValidationError('Invalid date format. Expected YYYY-MM-DD');
  }

  // Also validate that it's a valid date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new ValidationError('Invalid date');
  }
}

/**
 * Validate numeric range
 */
export function validateRange(value: number, min: number, max: number, fieldName: string): void {
  if (value < min || value > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
  }
}

/**
 * Validate string length
 */
export function validateStringLength(
  value: string,
  minLength: number,
  maxLength: number,
  fieldName: string
): void {
  if (value.length < minLength || value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be between ${minLength} and ${maxLength} characters`
    );
  }
}

/**
 * Safe async wrapper for procedures
 */
export async function safeAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw handleError(error);
  }
}

/**
 * Validate batch status transitions
 */
export function validateBatchStatusTransition(
  currentStatus: string,
  newStatus: string
): void {
  // التسلسل الجديد: أي رفض من أي مرحلة يعيد الدفعة إلى draft
  const validTransitions: Record<string, string[]> = {
    draft: ['under_accountant_review'],
    under_accountant_review: ['under_financial_review', 'draft'], // المحاسب: اعتماد → مراجع | رفض → draft
    under_financial_review: ['under_accounts_manager_review', 'draft'], // المراجع: اعتماد → مدير مالي | رفض → draft
    under_accounts_manager_review: ['approved', 'draft'], // المدير المالي: اعتماد → approved | رفض → draft
    approved: [],
    rejected_final: [],
  };

  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from ${currentStatus} to ${newStatus}`
    );
  }
}

/**
 * Validate permission
 */
export function validatePermission(hasPermission: boolean, action: string): void {
  if (!hasPermission) {
    throw new UnauthorizedError(`You don't have permission to ${action}`);
  }
}

/**
 * Validate worker exists
 */
export async function validateWorkerExists(workerId: number, db: any): Promise<void> {
  const worker = await db.getWorkerById(workerId);
  if (!worker) {
    throw new NotFoundError('Worker', workerId);
  }
}

/**
 * Validate batch exists
 */
export async function validateBatchExists(batchId: number, db: any): Promise<void> {
  const batch = await db.getPayrollBatchDetails(batchId);
  if (!batch) {
    throw new NotFoundError('Payroll Batch', batchId);
  }
}

/**
 * Validate user exists
 */
export async function validateUserExists(userId: number, db: any): Promise<void> {
  const user = await db.getUserById(userId);
  if (!user) {
    throw new NotFoundError('User', userId);
  }
}
