import { z } from "zod";

/**
 * Zod Schemas للتحقق من صحة البيانات
 * Zod Schemas for Data Validation
 */

// Common schemas
export const IdSchema = z.number().int().positive();
export const EmailSchema = z.string().email();
export const PhoneSchema = z.string().regex(/^\+?[0-9]{7,15}$/);
export const DateSchema = z.string().datetime();
export const CurrencySchema = z.string().regex(/^\d+(\.\d{2})?$/);

// User schemas
export const UserCreateSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
  fullName: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const UserUpdateSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(2).max(100).optional(),
  email: EmailSchema.optional().nullable(),
  phone: PhoneSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

// Worker schemas
export const WorkerCreateSchema = z.object({
  code: z.string().min(1).max(50),
  fullName: z.string().min(2).max(100),
  nationalId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  groupId: z.number().int().positive().optional().nullable(),
  jobId: z.number().int().positive().optional().nullable(),
  dailyRate: CurrencySchema.optional().nullable(),
  hireDate: DateSchema.optional().nullable(),
});

export const WorkerUpdateSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).max(50).optional(),
  fullName: z.string().min(2).max(100).optional(),
  nationalId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  groupId: z.number().int().positive().optional().nullable(),
  jobId: z.number().int().positive().optional().nullable(),
  dailyRate: CurrencySchema.optional().nullable(),
  hireDate: DateSchema.optional().nullable(),
});

// Group schemas
export const GroupCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  costCenterId: z.number().int().positive().optional().nullable(),
  supervisorId: z.number().int().positive().optional().nullable(),
  dailyRate: CurrencySchema.optional(),
  isActive: z.boolean().default(true),
});

export const GroupUpdateSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(2).max(100).optional(),
  costCenterId: z.number().int().positive().optional().nullable(),
  supervisorId: z.number().int().positive().optional().nullable(),
  dailyRate: CurrencySchema.optional(),
  isActive: z.boolean().optional(),
});

// Attendance schemas
export const AttendanceEventCreateSchema = z.object({
  workerId: IdSchema,
  eventType: z.enum(['check_in', 'check_out']),
  eventTime: DateSchema,
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const AttendanceEventUpdateSchema = z.object({
  id: IdSchema,
  eventTime: DateSchema.optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// Payroll schemas
export const PayrollBatchCreateSchema = z.object({
  batchCode: z.string().min(1).max(50),
  periodStart: DateSchema,
  periodEnd: DateSchema,
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('draft'),
  notes: z.string().optional(),
});

export const PayrollBatchUpdateSchema = z.object({
  id: IdSchema,
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional(),
  notes: z.string().optional(),
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Search schema
export const SearchSchema = z.object({
  query: z.string().min(1).max(100),
  fields: z.array(z.string()).optional(),
});

// Date range schema
export const DateRangeSchema = z.object({
  startDate: DateSchema,
  endDate: DateSchema,
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية" }
);

// Cost Center schemas
export const CostCenterCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const CostCenterUpdateSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// Permission schemas
export const PermissionGrantSchema = z.object({
  userId: IdSchema,
  permission: z.string().min(1),
  scopeType: z.enum(['global', 'cost_center', 'group', 'worker']).default('global'),
  scopeId: z.number().int().positive().optional(),
});

// Validation helper
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Safe validation helper (returns null on error)
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  try {
    return schema.parse(data);
  } catch {
    return null;
  }
}
