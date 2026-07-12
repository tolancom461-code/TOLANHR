/**
 * Middleware for validation, error handling, and logging
 * Applied to all tRPC procedures
 */

import { TRPCError } from '@trpc/server';
import * as validation from './validation';

/**
 * Logger utility for tracking operations
 */
export const logger = {
  info: (operation: string, details: Record<string, any>) => {
    console.log(`[INFO] ${operation}:`, JSON.stringify(details, null, 2));
  },
  warn: (operation: string, details: Record<string, any>) => {
    console.warn(`[WARN] ${operation}:`, JSON.stringify(details, null, 2));
  },
  error: (operation: string, error: any, details?: Record<string, any>) => {
    console.error(`[ERROR] ${operation}:`, error?.message || error, details ? JSON.stringify(details, null, 2) : '');
  },
};

/**
 * Validation middleware for worker data
 */
export function validateWorkerInput(data: any) {
  const result = validation.validateWorkerData(data);
  if (!result.isValid) {
    logger.warn('validateWorkerInput', { errors: result.errors, data });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Worker validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validateWorkerInput', { status: 'valid', workerId: data.id });
}

/**
 * Validation middleware for group data
 */
export function validateGroupInput(data: any) {
  const result = validation.validateGroupData(data);
  if (!result.isValid) {
    logger.warn('validateGroupInput', { errors: result.errors, data });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Group validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validateGroupInput', { status: 'valid', groupId: data.id });
}

/**
 * Validation middleware for payroll data
 */
export function validatePayrollInput(data: any) {
  const result = validation.validatePayrollData(data);
  if (!result.isValid) {
    logger.warn('validatePayrollInput', { errors: result.errors, data });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Payroll validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validatePayrollInput', { status: 'valid', amount: data.baseAmount });
}

/**
 * Validation middleware for attendance data
 */
export function validateAttendanceInput(data: any) {
  const result = validation.validateAttendanceData(data);
  if (!result.isValid) {
    logger.warn('validateAttendanceInput', { errors: result.errors, data });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Attendance validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validateAttendanceInput', { status: 'valid', workerId: data.workerId });
}

/**
 * Validation middleware for period dates
 */
export function validatePeriodInput(startDate: string, endDate: string) {
  const result = validation.validatePeriodDates(startDate, endDate);
  if (!result.isValid) {
    logger.warn('validatePeriodInput', { errors: result.errors, startDate, endDate });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Period validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validatePeriodInput', { status: 'valid', startDate, endDate });
}

/**
 * Validation middleware for special cases
 */
export function validateSpecialCaseInput(data: any) {
  const result = validation.validateSpecialCase(data);
  if (!result.isValid) {
    logger.warn('validateSpecialCaseInput', { errors: result.errors, data });
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Special case validation failed: ${result.errors.join(', ')}`,
    });
  }
  logger.info('validateSpecialCaseInput', { status: 'valid', type: data.type });
}

/**
 * Error handler wrapper for async operations
 */
export async function withErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  try {
    logger.info(`${operation}_start`, context || {});
    const result = await fn();
    logger.info(`${operation}_success`, { ...context, resultType: typeof result });
    return result;
  } catch (error) {
    logger.error(`${operation}_failed`, error, context);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Operation failed: ${operation}`,
      cause: error,
    });
  }
}

/**
 * Batch operation logger
 */
export function logBatchOperation(
  operationType: 'create' | 'update' | 'delete' | 'approve' | 'reject',
  batchId: number,
  batchCode: string,
  details?: Record<string, any>
) {
  logger.info(`batch_${operationType}`, {
    batchId,
    batchCode,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Worker operation logger
 */
export function logWorkerOperation(
  operationType: 'create' | 'update' | 'delete' | 'attendance' | 'deduction',
  workerId: number,
  details?: Record<string, any>
) {
  logger.info(`worker_${operationType}`, {
    workerId,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Payroll calculation logger
 */
export function logPayrollCalculation(
  workerId: number,
  calculationDetails: {
    baseAmount: number;
    deductions: number;
    bonuses: number;
    netAmount: number;
  }
) {
  logger.info('payroll_calculation', {
    workerId,
    ...calculationDetails,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Performance logger
 */
export function logPerformance(operation: string, startTime: number, endTime: number, details?: Record<string, any>) {
  const duration = endTime - startTime;
  logger.info(`${operation}_performance`, {
    durationMs: duration,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Audit logger for sensitive operations
 */
export function logAudit(
  action: string,
  userId: number,
  resourceType: string,
  resourceId: number,
  changes?: Record<string, any>
) {
  logger.info('audit', {
    action,
    userId,
    resourceType,
    resourceId,
    changes,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Data consistency check logger
 */
export function logDataConsistencyCheck(
  checkType: string,
  passed: boolean,
  details?: Record<string, any>
) {
  const logFn = passed ? logger.info : logger.warn;
  logFn('data_consistency_check', {
    checkType,
    passed,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Batch of operations logger
 */
export function logBatchOperations(
  operationType: string,
  count: number,
  successCount: number,
  failureCount: number,
  details?: Record<string, any>
) {
  logger.info('batch_operations', {
    operationType,
    totalCount: count,
    successCount,
    failureCount,
    successRate: `${((successCount / count) * 100).toFixed(2)}%`,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Exception logger
 */
export function logException(
  exceptionType: string,
  message: string,
  stack?: string,
  context?: Record<string, any>
) {
  logger.error('exception', new Error(message), {
    exceptionType,
    stack,
    ...context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a safe async wrapper with validation and logging
 */
export function createSafeOperation<T>(
  operationName: string,
  validationFn?: (input: any) => void
) {
  return async (input: any, fn: () => Promise<T>): Promise<T> => {
    const startTime = Date.now();

    try {
      // Validate input if validation function provided
      if (validationFn) {
        validationFn(input);
      }

      // Execute operation
      const result = await fn();

      // Log performance
      logPerformance(operationName, startTime, Date.now(), { status: 'success' });

      return result;
    } catch (error) {
      // Log error
      logPerformance(operationName, startTime, Date.now(), { status: 'error', error: (error as Error).message });
      throw error;
    }
  };
}
