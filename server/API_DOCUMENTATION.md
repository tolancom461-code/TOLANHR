# TolanWorkforce API Documentation

## Overview

TolanWorkforce is a comprehensive workforce management system with integrated payroll processing. This document outlines the API procedures, validation rules, and error handling.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Validation Rules](#validation-rules)
3. [Error Handling](#error-handling)
4. [Logging](#logging)
5. [Procedures](#procedures)
6. [Integration Workflows](#integration-workflows)

---

## Authentication

### Session Management

- **Login**: `auth.localLogin` - Authenticate with username and password
- **Logout**: `auth.logout` - Clear session cookie
- **Current User**: `auth.me` - Get current authenticated user

### Protected Procedures

All procedures marked as `protectedProcedure` require:
- Valid session cookie (JWT token)
- Active user account
- Appropriate permissions

---

## Validation Rules

### Worker Data Validation

```typescript
{
  fullName: string (required, 1-255 chars)
  code: string (required, 1-50 chars)
  groupId: number (optional, must be positive)
  dailyRate: number (optional, must be non-negative, max 1,000,000)
  status: 'active' | 'inactive' | 'archived' (optional)
}
```

**Errors**:
- `BAD_REQUEST`: Invalid worker data format
- `UNPROCESSABLE_CONTENT`: Missing required fields

### Group Data Validation

```typescript
{
  name: string (required, 1-255 chars)
  code: string (required, 1-50 chars)
  dailyWage: number (optional, must be non-negative, max 1,000,000)
  workMinutes: number (optional, 1-1440)
  latePenaltyRate: number (optional, 0-100%)
  earlyLeavePenaltyRate: number (optional, 0-100%)
  shiftStartTime: string (optional, HH:MM format)
  shiftEndTime: string (optional, HH:MM format)
}
```

**Errors**:
- `BAD_REQUEST`: Invalid group data format
- `UNPROCESSABLE_CONTENT`: Shift end time before start time

### Payroll Data Validation

```typescript
{
  baseAmount: number (required, must be non-negative)
  deductions: number (optional, must be non-negative)
  bonuses: number (optional, must be non-negative)
  netAmount: number (optional, must equal baseAmount - deductions + bonuses)
}
```

**Errors**:
- `BAD_REQUEST`: Invalid payroll calculation
- `UNPROCESSABLE_CONTENT`: Calculation mismatch

### Attendance Data Validation

```typescript
{
  checkInTime: string (optional, HH:MM format)
  checkOutTime: string (optional, HH:MM format)
  workDate: string (required, YYYY-MM-DD format)
}
```

**Errors**:
- `BAD_REQUEST`: Invalid time format
- `UNPROCESSABLE_CONTENT`: Check-out before check-in

### Period Validation

```typescript
{
  startDate: string (required, YYYY-MM-DD format)
  endDate: string (required, YYYY-MM-DD format)
}
```

**Constraints**:
- `endDate` must be after `startDate`
- Period cannot exceed 365 days

**Errors**:
- `BAD_REQUEST`: Invalid date format
- `UNPROCESSABLE_CONTENT`: Invalid date range

---

## Error Handling

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `BAD_REQUEST` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `UNPROCESSABLE_CONTENT` | 422 | Validation failed |
| `CONFLICT` | 409 | Duplicate resource |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

### Error Response Format

```typescript
{
  code: string;
  message: string;
  cause?: any;
}
```

### Common Error Scenarios

1. **Duplicate Batch Code**
   - Error: `CONFLICT`
   - Message: "Batch code already exists"
   - Solution: Generate unique batch code

2. **Invalid Period**
   - Error: `UNPROCESSABLE_CONTENT`
   - Message: "End date must be after start date"
   - Solution: Correct date range

3. **Missing Required Field**
   - Error: `BAD_REQUEST`
   - Message: "Field validation failed: [field] is required"
   - Solution: Provide all required fields

---

## Logging

### Log Levels

- **INFO**: Normal operations (batch creation, calculations)
- **WARN**: Validation failures, edge cases
- **ERROR**: Exceptions, failed operations

### Log Format

```
[LEVEL] operation: {
  "timestamp": "2026-01-29T21:08:29.013Z",
  "details": {...}
}
```

### Logged Operations

1. **Batch Operations**
   - `batch_create`: New payroll batch created
   - `batch_update`: Batch status updated
   - `batch_approve`: Batch approved
   - `batch_reject`: Batch rejected

2. **Worker Operations**
   - `worker_create`: New worker added
   - `worker_attendance`: Attendance recorded
   - `worker_deduction`: Deduction applied

3. **Payroll Operations**
   - `payroll_calculation`: Salary calculated
   - `payroll_approval`: Payroll approved
   - `payroll_distribution`: Payments processed

4. **Audit Operations**
   - `audit`: Sensitive operations logged with user ID

---

## Procedures

### Batch Management

#### Create Payroll Batch

```typescript
payroll.createBatch({
  periodStart: string (YYYY-MM-DD)
  periodEnd: string (YYYY-MM-DD)
  groupId: number | null
  costCenterId: number | null
  createdBy: number
})
```

**Returns**: `{ batchId: number, batchCode: string, status: 'draft' }`

**Errors**:
- `BAD_REQUEST`: Invalid period
- `CONFLICT`: Duplicate batch code

#### Get Batch Details

```typescript
payroll.getBatch(batchId: number)
```

**Returns**: Batch object with all details

**Errors**:
- `NOT_FOUND`: Batch not found

#### List Batches

```typescript
payroll.listBatches({
  status?: 'draft' | 'approved' | 'rejected'
  limit?: number
  offset?: number
})
```

**Returns**: Array of batch objects

#### Approve Batch

```typescript
payroll.approveBatch({
  batchId: number
  approvedBy: number
  notes?: string
})
```

**Returns**: `{ success: true }`

**Errors**:
- `NOT_FOUND`: Batch not found
- `FORBIDDEN`: Cannot approve non-draft batch

#### Reject Batch

```typescript
payroll.rejectBatch({
  batchId: number
  rejectedBy: number
  reason: string
})
```

**Returns**: `{ success: true }`

**Errors**:
- `NOT_FOUND`: Batch not found
- `FORBIDDEN`: Cannot reject non-draft batch

### Attendance Management

#### Record Attendance

```typescript
attendance.record({
  workerId: number
  attendanceDate: Date
  checkInTime: string (HH:MM)
  checkOutTime: string (HH:MM)
  status: 'present' | 'late' | 'absent'
})
```

**Returns**: `{ success: true, attendanceId: number }`

**Errors**:
- `BAD_REQUEST`: Invalid time format
- `NOT_FOUND`: Worker not found

#### Get Attendance

```typescript
attendance.get({
  workerId: number
  startDate: Date
  endDate: Date
})
```

**Returns**: Array of attendance records

#### Calculate Daily Finance

```typescript
finance.calculateDaily({
  workerId: number
  attendanceDate: Date
})
```

**Returns**: `{ workDate: Date, baseAmount: number, deductions: number, bonuses: number, netAmount: number }`

**Errors**:
- `NOT_FOUND`: Worker or attendance not found

### Deduction Management

#### Add Deduction

```typescript
deductions.add({
  workerId: number
  deductionDate: Date
  amount: number
  reason: string
  deductionType: 'penalty' | 'deduction' | 'tax'
})
```

**Returns**: `{ success: true, deductionId: number }`

**Errors**:
- `BAD_REQUEST`: Negative amount
- `NOT_FOUND`: Worker not found

#### Get Deductions

```typescript
deductions.get({
  workerId: number
  startDate: Date
  endDate: Date
})
```

**Returns**: Array of deduction records

#### Remove Deduction

```typescript
deductions.remove(deductionId: number)
```

**Returns**: `{ success: true }`

**Errors**:
- `NOT_FOUND`: Deduction not found
- `FORBIDDEN`: Cannot remove applied deduction

### Overtime Management

#### Record Overtime

```typescript
overtime.record({
  workerId: number
  overtimeDate: Date
  overtimeMinutes: number
  reason: string
})
```

**Returns**: `{ success: true, overtimeId: number }`

**Errors**:
- `BAD_REQUEST`: Invalid duration
- `NOT_FOUND`: Worker not found

#### Get Overtime

```typescript
overtime.get({
  workerId: number
  startDate: Date
  endDate: Date
})
```

**Returns**: Array of overtime records with total hours

---

## Integration Workflows

### Workflow 1: Complete Payroll Cycle

1. **Create Batch**
   ```
   POST /trpc/payroll.createBatch
   ```

2. **Record Attendance**
   ```
   POST /trpc/attendance.record (multiple calls)
   ```

3. **Add Deductions**
   ```
   POST /trpc/deductions.add (multiple calls)
   ```

4. **Record Overtime**
   ```
   POST /trpc/overtime.record (multiple calls)
   ```

5. **Calculate Payroll**
   ```
   POST /trpc/finance.calculateDaily (multiple calls)
   ```

6. **Approve Batch**
   ```
   POST /trpc/payroll.approveBatch
   ```

### Workflow 2: Error Recovery

If any step fails:

1. **Log Error**
   - Error details logged with context
   - Operation rolled back

2. **Notify User**
   - Error message displayed
   - Suggested corrective action provided

3. **Retry**
   - User corrects input
   - Operation retried

### Workflow 3: Concurrent Operations

For multiple workers:

1. **Batch Processing**
   - Operations executed in parallel
   - Results aggregated
   - Failures tracked separately

2. **Consistency Check**
   - Verify all operations completed
   - Check for data consistency
   - Log any discrepancies

---

## Best Practices

### Input Validation

Always validate input before sending to API:

```typescript
import { validateWorkerData } from './validation';

const result = validateWorkerData(input);
if (!result.isValid) {
  console.error('Validation errors:', result.errors);
  return;
}
```

### Error Handling

Implement comprehensive error handling:

```typescript
try {
  const result = await trpc.payroll.createBatch.mutate(input);
} catch (error) {
  if (error.code === 'CONFLICT') {
    // Handle duplicate batch code
  } else if (error.code === 'BAD_REQUEST') {
    // Handle invalid input
  } else {
    // Handle other errors
  }
}
```

### Logging

Log important operations:

```typescript
import { logger, logBatchOperation } from './middleware';

logger.info('operation_start', { workerId, batchId });
logBatchOperation('create', batchId, batchCode, { groupId });
```

### Performance

For large operations:

1. Use batch processing
2. Implement pagination
3. Cache frequently accessed data
4. Monitor operation duration

---

## Rate Limiting

- **Default**: 100 requests per minute
- **Batch Operations**: 10 requests per minute
- **Retry-After**: Included in response headers

---

## Versioning

Current API Version: **1.0.0**

- Breaking changes will increment major version
- New features will increment minor version
- Bug fixes will increment patch version

---

## Support

For API issues or questions:
- Check error codes and messages
- Review logs for detailed information
- Contact support with operation details and timestamps
