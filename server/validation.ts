/**
 * Comprehensive validation utilities for payroll system
 * Validates all inputs related to workers, groups, and payroll calculations
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate worker data
 */
export function validateWorkerData(data: {
  fullName?: string;
  code?: string;
  groupId?: number;
  dailyRate?: number;
  status?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate full name
  if (data.fullName !== undefined) {
    if (typeof data.fullName !== 'string' || data.fullName.trim().length === 0) {
      errors.push('Full name must be a non-empty string');
    }
    if (data.fullName.length > 255) {
      errors.push('Full name must not exceed 255 characters');
    }
  }

  // Validate code
  if (data.code !== undefined) {
    if (typeof data.code !== 'string' || data.code.trim().length === 0) {
      errors.push('Worker code must be a non-empty string');
    }
    if (data.code.length > 50) {
      errors.push('Worker code must not exceed 50 characters');
    }
  }

  // Validate group ID
  if (data.groupId !== undefined) {
    if (!Number.isInteger(data.groupId) || data.groupId <= 0) {
      errors.push('Group ID must be a positive integer');
    }
  }

  // Validate daily rate
  if (data.dailyRate !== undefined) {
    if (typeof data.dailyRate !== 'number' || data.dailyRate < 0) {
      errors.push('Daily rate must be a non-negative number');
    }
    if (data.dailyRate > 1000000) {
      errors.push('Daily rate exceeds maximum allowed value');
    }
  }

  // Validate status
  if (data.status !== undefined) {
    const validStatuses = ['active', 'inactive', 'archived'];
    if (!validStatuses.includes(data.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate group data
 */
export function validateGroupData(data: {
  name?: string;
  code?: string;
  dailyWage?: number;
  workMinutes?: number;
  latePenaltyRate?: number;
  earlyLeavePenaltyRate?: number;
}): ValidationResult {
  const errors: string[] = [];

  // Validate name
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('Group name must be a non-empty string');
    }
    if (data.name.length > 255) {
      errors.push('Group name must not exceed 255 characters');
    }
  }

  // Validate code
  if (data.code !== undefined) {
    if (typeof data.code !== 'string' || data.code.trim().length === 0) {
      errors.push('Group code must be a non-empty string');
    }
    if (data.code.length > 50) {
      errors.push('Group code must not exceed 50 characters');
    }
  }

  // Validate daily wage
  if (data.dailyWage !== undefined) {
    if (typeof data.dailyWage !== 'number' || data.dailyWage < 0) {
      errors.push('Daily wage must be a non-negative number');
    }
    if (data.dailyWage > 1000000) {
      errors.push('Daily wage exceeds maximum allowed value');
    }
  }

  // Validate work minutes
  if (data.workMinutes !== undefined) {
    if (!Number.isInteger(data.workMinutes) || data.workMinutes <= 0) {
      errors.push('Work minutes must be a positive integer');
    }
    if (data.workMinutes > 1440) {
      errors.push('Work minutes cannot exceed 1440 (24 hours)');
    }
  }

  // Validate penalty rates
  if (data.latePenaltyRate !== undefined) {
    if (typeof data.latePenaltyRate !== 'number' || data.latePenaltyRate < 0) {
      errors.push('Late penalty rate must be a non-negative number');
    }
    if (data.latePenaltyRate > 100) {
      errors.push('Late penalty rate cannot exceed 100%');
    }
  }

  if (data.earlyLeavePenaltyRate !== undefined) {
    if (typeof data.earlyLeavePenaltyRate !== 'number' || data.earlyLeavePenaltyRate < 0) {
      errors.push('Early leave penalty rate must be a non-negative number');
    }
    if (data.earlyLeavePenaltyRate > 100) {
      errors.push('Early leave penalty rate cannot exceed 100%');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payroll data (salaries, deductions, bonuses)
 */
export function validatePayrollData(data: {
  baseAmount?: number;
  deductions?: number;
  bonuses?: number;
  netAmount?: number;
}): ValidationResult {
  const errors: string[] = [];

  // Validate base amount
  if (data.baseAmount !== undefined) {
    if (typeof data.baseAmount !== 'number' || data.baseAmount < 0) {
      errors.push('Base amount must be a non-negative number');
    }
    if (data.baseAmount > 1000000) {
      errors.push('Base amount exceeds maximum allowed value');
    }
  }

  // Validate deductions
  if (data.deductions !== undefined) {
    if (typeof data.deductions !== 'number' || data.deductions < 0) {
      errors.push('Deductions must be a non-negative number');
    }
    if (data.deductions > 1000000) {
      errors.push('Deductions exceed maximum allowed value');
    }
  }

  // Validate bonuses
  if (data.bonuses !== undefined) {
    if (typeof data.bonuses !== 'number' || data.bonuses < 0) {
      errors.push('Bonuses must be a non-negative number');
    }
    if (data.bonuses > 1000000) {
      errors.push('Bonuses exceed maximum allowed value');
    }
  }

  // Validate net amount
  if (data.netAmount !== undefined) {
    if (typeof data.netAmount !== 'number' || data.netAmount < 0) {
      errors.push('Net amount must be a non-negative number');
    }
    if (data.netAmount > 1000000) {
      errors.push('Net amount exceeds maximum allowed value');
    }
  }

  // Validate calculation consistency
  if (data.baseAmount !== undefined && data.deductions !== undefined && data.bonuses !== undefined && data.netAmount !== undefined) {
    const calculated = data.baseAmount - data.deductions + data.bonuses;
    const difference = Math.abs(calculated - data.netAmount);
    if (difference > 0.01) { // Allow for floating point rounding
      errors.push(`Net amount calculation mismatch: expected ${calculated.toFixed(2)}, got ${data.netAmount.toFixed(2)}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate attendance data
 */
export function validateAttendanceData(data: {
  checkInTime?: string;
  checkOutTime?: string;
  workDate?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate check-in time
  if (data.checkInTime !== undefined) {
    if (!isValidTimeFormat(data.checkInTime)) {
      errors.push('Check-in time must be in HH:MM format');
    }
  }

  // Validate check-out time
  if (data.checkOutTime !== undefined) {
    if (!isValidTimeFormat(data.checkOutTime)) {
      errors.push('Check-out time must be in HH:MM format');
    }
  }

  // Validate work date
  if (data.workDate !== undefined) {
    if (!isValidDateFormat(data.workDate)) {
      errors.push('Work date must be in YYYY-MM-DD format');
    }
  }

  // Validate time order
  if (data.checkInTime && data.checkOutTime) {
    if (data.checkInTime >= data.checkOutTime) {
      errors.push('Check-out time must be after check-in time');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate period dates
 */
export function validatePeriodDates(startDate: string, endDate: string): ValidationResult {
  const errors: string[] = [];

  if (!isValidDateFormat(startDate)) {
    errors.push('Start date must be in YYYY-MM-DD format');
  }

  if (!isValidDateFormat(endDate)) {
    errors.push('End date must be in YYYY-MM-DD format');
  }

  if (isValidDateFormat(startDate) && isValidDateFormat(endDate)) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      errors.push('End date must be after start date');
    }

    const daysDifference = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDifference > 365) {
      errors.push('Period cannot exceed 365 days');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Helper function to validate time format (HH:MM)
 */
function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Helper function to validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;

  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Validate batch period
 */
export function validateBatchPeriod(periodStart: string, periodEnd: string): ValidationResult {
  return validatePeriodDates(periodStart, periodEnd);
}

/**
 * Validate special cases (leaves, absences, overtime)
 */
export function validateSpecialCase(data: {
  type?: string;
  duration?: number;
  reason?: string;
}): ValidationResult {
  const errors: string[] = [];

  // Validate type
  if (data.type !== undefined) {
    const validTypes = ['leave', 'absence', 'overtime', 'holiday'];
    if (!validTypes.includes(data.type)) {
      errors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }
  }

  // Validate duration
  if (data.duration !== undefined) {
    if (!Number.isInteger(data.duration) || data.duration <= 0) {
      errors.push('Duration must be a positive integer');
    }
    if (data.duration > 1440) {
      errors.push('Duration cannot exceed 1440 minutes (24 hours)');
    }
  }

  // Validate reason
  if (data.reason !== undefined) {
    if (typeof data.reason !== 'string' || data.reason.trim().length === 0) {
      errors.push('Reason must be a non-empty string');
    }
    if (data.reason.length > 500) {
      errors.push('Reason must not exceed 500 characters');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
