import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, foreignKey, int, decimal, date, mysqlEnum, text, timestamp, varchar, tinyint, unique, primaryKey } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const assignmentSettlements = mysqlTable("assignment_settlements", {
	id: int().autoincrement().notNull(),
	assignmentId: int("assignment_id").notNull().references(() => temporaryAssignments.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	fromBatchId: int("from_batch_id").references(() => payrollBatches.id, { onDelete: "set null", onUpdate: "cascade" } ),
	toBatchId: int("to_batch_id").references(() => payrollBatches.id, { onDelete: "set null", onUpdate: "cascade" } ),
	fromCostCenterId: int("from_cost_center_id").references(() => costCenters.id, { onDelete: "set null", onUpdate: "cascade" } ),
	toCostCenterId: int("to_cost_center_id").references(() => costCenters.id, { onDelete: "set null", onUpdate: "cascade" } ),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	days: int().default(1).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	settlementDate: date("settlement_date", { mode: 'string' }).notNull(),
	status: mysqlEnum(['applied','reversed']).default('applied'),
	appliedBy: int("applied_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_settlements_assignment_id").on(table.assignmentId),
	index("idx_settlements_worker_id").on(table.workerId),
	index("idx_settlements_from_batch").on(table.fromBatchId),
	index("idx_settlements_to_batch").on(table.toBatchId),
]);

export const attendanceEvents = mysqlTable("attendance_events", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	eventType: mysqlEnum("event_type", ['check_in','check_out']).notNull(),
	eventTime: timestamp("event_time", { mode: 'string' }).notNull(),
	deviceId: int("device_id"),
	verifiedBy: int("verified_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	method: varchar({ length: 50 }),
	note: text(),
	isAutomatic: tinyint("is_automatic").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	workDate: date("work_date", { mode: 'string' }),
	ipAddress: varchar("ip_address", { length: 45 }),
	deviceInfo: text("device_info"),
},
(table) => [
	index("idx_attendance_work_date").on(table.workDate),
	index("idx_attendance_worker_work_date").on(table.workerId, table.workDate),
]);

export const auditLog = mysqlTable("audit_log", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	action: varchar({ length: 100 }).notNull(),
	tableName: varchar("table_name", { length: 100 }),
	recordId: int("record_id"),
	oldValues: text("old_values"),
	newValues: text("new_values"),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_audit_user_id").on(table.userId),
	index("idx_audit_action").on(table.action),
	index("idx_audit_created_at").on(table.createdAt),
]);

export const costCenters = mysqlTable("cost_centers", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("cost_centers_code_unique").on(table.code),
]);

export const deductionRules = mysqlTable("deduction_rules", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	ruleType: mysqlEnum("rule_type", ['late','early_leave','absence','other']).notNull(),
	minMinutes: int("min_minutes").default(0),
	maxMinutes: int("max_minutes"),
	deductionType: mysqlEnum("deduction_type", ['fixed','percentage','hourly']).notNull(),
	deductionValue: decimal("deduction_value", { precision: 10, scale: 2 }).notNull(),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("deduction_rules_code_unique").on(table.code),
]);

export const devices = mysqlTable("devices", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	location: varchar({ length: 255 }),
	isActive: tinyint("is_active").default(1),
	lastSeen: timestamp("last_seen", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("devices_code_unique").on(table.code),
]);

export const groupSchedules = mysqlTable("group_schedules", {
	id: int().autoincrement().notNull(),
	groupId: int("group_id").notNull().references(() => groups.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	dayOfWeek: int("day_of_week").notNull(),
	startTime: varchar("start_time", { length: 10 }).notNull(),
	endTime: varchar("end_time", { length: 10 }).notNull(),
	requiredHours: decimal("required_hours", { precision: 4, scale: 2 }).notNull(),
	dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	effectiveDate: date("effective_date", { mode: 'string' }),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_group_day").on(table.groupId, table.dayOfWeek),
]);

export const payrollBatchSequences = mysqlTable("payroll_batch_sequences", {
	year: int().notNull(),
	counter: int().default(0).notNull(),
},
(table) => [
	primaryKey({ columns: [table.year] }),
]);

export const restaurants = mysqlTable("restaurants", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 255 }).notNull(),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const dailyWorkAssignments = mysqlTable("daily_work_assignments", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	restaurantId: int("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "restrict", onUpdate: "cascade" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	workDate: date("work_date", { mode: 'string' }).notNull(),
	assignedBy: int("assigned_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_dwa_restaurant_date").on(table.restaurantId, table.workDate),
	index("idx_dwa_date").on(table.workDate),
	unique("uq_worker_workdate").on(table.workerId, table.workDate),
]);

export const groups = mysqlTable("groups", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	costCenterId: int("cost_center_id").references(() => costCenters.id, { onDelete: "set null", onUpdate: "cascade" } ),
	supervisorId: int("supervisor_id").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	dailyWage: decimal("daily_wage", { precision: 10, scale: 2 }),
	workMinutes: int("work_minutes"),
	minuteCost: decimal("minute_cost", { precision: 10, scale: 4 }),
	latePenaltyRate: decimal("late_penalty_rate", { precision: 5, scale: 2 }),
	earlyLeavePenaltyRate: decimal("early_leave_penalty_rate", { precision: 5, scale: 2 }),
	isFlexibleSchedule: tinyint("is_flexible_schedule").default(0),
	requiredHours: decimal("required_hours", { precision: 4, scale: 2 }).default('8.00'),
},
(table) => [
	index("groups_code_unique").on(table.code),
]);

export const jobs = mysqlTable("jobs", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	isActive: tinyint("is_active").default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("jobs_code_unique").on(table.code),
]);

export const loginSessions = mysqlTable("login_sessions", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	username: varchar({ length: 100 }).notNull(),
	loginMethod: varchar("login_method", { length: 50 }).notNull(),
	status: mysqlEnum(['success','failed','blocked']).notNull(),
	ipAddress: varchar("ip_address", { length: 45 }).notNull(),
	userAgent: text("user_agent").notNull(),
	deviceInfo: text("device_info"),
	failureReason: text("failure_reason"),
	sessionToken: varchar("session_token", { length: 255 }),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	logoutAt: timestamp("logout_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_login_user_id").on(table.userId),
	index("idx_login_status").on(table.status),
	index("idx_login_ip_address").on(table.ipAddress),
	index("idx_login_created_at").on(table.createdAt),
]);

export const operationalFlags = mysqlTable("operational_flags", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull(),
	groupId: int("group_id"),
	costCenterId: int("cost_center_id"),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	flagDate: date("flag_date", { mode: 'string' }).notNull(),
	flagType: mysqlEnum("flag_type", ['confirm_attendance','confirm_absence','transfer','other']).default('other').notNull(),
	description: text().notNull(),
	status: mysqlEnum(['pending','approved','rejected']).default('pending').notNull(),
	approvedBy: int("approved_by"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	approvalNotes: text("approval_notes"),
	createdBy: int("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_op_flags_worker_id").on(table.workerId),
	index("idx_op_flags_flag_date").on(table.flagDate),
	index("idx_op_flags_status").on(table.status),
	index("idx_op_flags_flag_type").on(table.flagType),
]);

export const payOverrides = mysqlTable("pay_overrides", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	overrideDate: date("override_date", { mode: 'string' }).notNull(),
	overrideType: mysqlEnum("override_type", ['bonus','deduction','advance','emergency_call']).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	reason: text(),
	status: mysqlEnum(['pending','approved','rejected']).default('pending'),
	approvedBy: int("approved_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	createdBy: int("created_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const paymentVouchers = mysqlTable("payment_vouchers", {
	id: int().autoincrement().notNull(),
	voucherNumber: int("voucher_number").notNull(),
	costCenterId: int("cost_center_id").references(() => costCenters.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	voucherDate: date("voucher_date", { mode: 'string' }).notNull(),
	recipientName: varchar("recipient_name", { length: 255 }).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	description: text().notNull(),
	createdBy: int("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP'),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow(),
},
(table) => [
	index("voucher_number").on(table.voucherNumber),
]);

export const payrollBatchCorrections = mysqlTable("payroll_batch_corrections", {
	id: int().autoincrement().notNull(),
	batchId: int("batch_id").notNull().references(() => payrollBatches.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	correctorId: int("corrector_id").notNull(),
	correctionNote: text("correction_note"),
	previousStatus: varchar("previous_status", { length: 50 }),
	newStatus: varchar("new_status", { length: 50 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_batch_corrections_batch_id").on(table.batchId),
]);

export const payrollBatchItems = mysqlTable("payroll_batch_items", {
	id: int().autoincrement().notNull(),
	batchId: int("batch_id").notNull().references(() => payrollBatches.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	groupId: int("group_id").references(() => groups.id, { onDelete: "set null", onUpdate: "cascade" } ),
	daysWorked: int("days_worked").default(0),
	baseAmount: decimal("base_amount", { precision: 10, scale: 2 }).default('0.00'),
	totalDeductions: decimal("total_deductions", { precision: 10, scale: 2 }).default('0.00'),
	totalBonuses: decimal("total_bonuses", { precision: 10, scale: 2 }).default('0.00'),
	netAmount: decimal("net_amount", { precision: 10, scale: 2 }).default('0.00'),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_payroll_items_batch_id").on(table.batchId),
	index("idx_payroll_items_worker_id").on(table.workerId),
	index("idx_payroll_items_batch_worker").on(table.batchId, table.workerId),
]);

export const payrollBatchNotes = mysqlTable("payroll_batch_notes", {
	id: int().autoincrement().notNull(),
	batchId: int("batch_id").notNull().references(() => payrollBatches.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	reviewerId: int("reviewer_id").notNull(),
	reviewerRole: varchar("reviewer_role", { length: 50 }).notNull(),
	noteType: mysqlEnum("note_type", ['critical','warning','info']).default('info'),
	errorLocation: varchar("error_location", { length: 255 }),
	workerId: int("worker_id").references(() => workers.id, { onDelete: "set null", onUpdate: "cascade" } ),
	fieldName: varchar("field_name", { length: 100 }),
	note: text().notNull(),
	attachmentUrl: varchar("attachment_url", { length: 500 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_batch_notes_batch_id").on(table.batchId),
]);

export const payrollBatches = mysqlTable("payroll_batches", {
	id: int().autoincrement().notNull(),
	batchCode: varchar("batch_code", { length: 50 }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodStart: date("period_start", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	periodEnd: date("period_end", { mode: 'string' }).notNull(),
	groupId: int("group_id").references(() => groups.id, { onDelete: "set null", onUpdate: "cascade" } ),
	costCenterId: int("cost_center_id").references(() => costCenters.id, { onDelete: "set null", onUpdate: "cascade" } ),
	totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default('0.00'),
	totalWorkers: int("total_workers").default(0),
	totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).default('0.00'),
	totalBonuses: decimal("total_bonuses", { precision: 12, scale: 2 }).default('0.00'),
	status: mysqlEnum(['draft','under_accountant_review','returned_from_accountant','under_financial_review','returned_from_financial_review','under_accounts_manager_review','approved','rejected_final','paid']).default('draft'),
	rejectionCount: int("rejection_count").default(0),
	notes: text(),
	approvedBy: int("approved_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	createdBy: int("created_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	isUnlocked: tinyint("is_unlocked").default(0),
	unlockReason: text("unlock_reason"),
	unlockedBy: int("unlocked_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	unlockedAt: timestamp("unlocked_at", { mode: 'string' }),
	accountantApprovedBy: int("accountant_approved_by"),
	accountantApprovedAt: timestamp("accountant_approved_at", { mode: 'string' }),
	auditorApprovedBy: int("auditor_approved_by"),
	auditorApprovedAt: timestamp("auditor_approved_at", { mode: 'string' }),
	financeApprovedBy: int("finance_approved_by"),
	financeApprovedAt: timestamp("finance_approved_at", { mode: 'string' }),
	rejectedBy: int("rejected_by"),
	rejectedAt: timestamp("rejected_at", { mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	rejectionStage: varchar("rejection_stage", { length: 50 }),
},
(table) => [
	index("payroll_batches_batch_code_unique").on(table.batchCode),
]);

export const permissions = mysqlTable("permissions", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 100 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	category: varchar({ length: 100 }),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("permissions_code_unique").on(table.code),
]);

export const rolePermissions = mysqlTable("role_permissions", {
	id: int().autoincrement().notNull(),
	roleId: int("role_id").notNull(),
	permissionId: int("permission_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const roles = mysqlTable("roles", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	level: int().default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("roles_code_unique").on(table.code),
]);

export const settings = mysqlTable("settings", {
	id: int().autoincrement().notNull(),
	key: varchar({ length: 100 }).notNull(),
	value: text(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("settings_key_unique").on(table.key),
]);

export const temporaryAssignments = mysqlTable("temporary_assignments", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull(),
	fromCostCenterId: int("from_cost_center_id"),
	fromGroupId: int("from_group_id").references(() => groups.id),
	toCostCenterId: int("to_cost_center_id").notNull(),
	toGroupId: int("to_group_id").references(() => groups.id),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	startDate: date("start_date", { mode: 'string' }).notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	endDate: date("end_date", { mode: 'string' }).notNull(),
	notes: text(),
	status: mysqlEnum(['active','cancelled']).default('active'),
	createdBy: int("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_temp_assign_worker_id").on(table.workerId),
	index("idx_temp_assign_to_cost_center").on(table.toCostCenterId),
	index("idx_temp_assign_dates").on(table.startDate, table.endDate),
]);

export const userCostCenters = mysqlTable("user_cost_centers", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	costCenterId: int("cost_center_id").notNull().references(() => costCenters.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_user_cc_user_id").on(table.userId),
	index("idx_user_cc_cost_center_id").on(table.costCenterId),
	index("idx_user_cc_unique").on(table.userId, table.costCenterId),
]);

export const userPermissions = mysqlTable("user_permissions", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull(),
	permissionId: int("permission_id").notNull(),
	granted: tinyint().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const userRoles = mysqlTable("user_roles", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull(),
	roleId: int("role_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }),
	username: varchar({ length: 100 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	email: varchar({ length: 320 }),
	phone: varchar({ length: 20 }),
	roleId: int("role_id"),
	isActive: tinyint("is_active").default(1),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['guard','supervisor','supervisor_tolan','supervisor_malqa','admin_affairs','accountant','auditor','finance_manager','executive','super_admin','restaurant_operations']).default('guard').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
	index("users_username_unique").on(table.username),
]);

export const workDays = mysqlTable("work_days", {
	id: int().autoincrement().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	workDate: date("work_date", { mode: 'string' }).notNull(),
	dayType: mysqlEnum("day_type", ['normal','holiday','weekend']).default('normal'),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const workerArchive = mysqlTable("worker_archive", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	archivedAt: timestamp("archived_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	reason: text(),
	archivedBy: int("archived_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
});

export const workerDailyFinance = mysqlTable("worker_daily_finance", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	workDate: date("work_date", { mode: 'string' }).notNull(),
	checkInTime: timestamp("check_in_time", { mode: 'string' }),
	checkOutTime: timestamp("check_out_time", { mode: 'string' }),
	workedMinutes: int("worked_minutes").default(0),
	financialMinutes: int("financial_minutes").default(0),
	baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).default('0.00'),
	latePenalty: decimal("late_penalty", { precision: 10, scale: 2 }).default('0.00'),
	earlyLeavePenalty: decimal("early_leave_penalty", { precision: 10, scale: 2 }).default('0.00'),
	netSalary: decimal("net_salary", { precision: 10, scale: 2 }).default('0.00'),
	baseAmount: decimal("base_amount", { precision: 10, scale: 2 }).default('0.00'),
	deductions: decimal({ precision: 10, scale: 2 }).default('0.00'),
	bonuses: decimal({ precision: 10, scale: 2 }).default('0.00'),
	netAmount: decimal("net_amount", { precision: 10, scale: 2 }).default('0.00'),
	lateMinutes: int("late_minutes").default(0),
	earlyLeaveMinutes: int("early_leave_minutes").default(0),
	notes: text(),
	lockedBatchId: int("locked_batch_id").references(() => payrollBatches.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	effectiveGroupId: int("effective_group_id"),
},
(table) => [
	index("idx_daily_finance_worker_id").on(table.workerId),
	index("idx_daily_finance_work_date").on(table.workDate),
	index("idx_daily_finance_locked_batch").on(table.lockedBatchId),
	index("idx_daily_finance_worker_date").on(table.workerId, table.workDate),
	index("idx_daily_finance_effective_group").on(table.effectiveGroupId),
]);

export const workers = mysqlTable("workers", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 50 }).notNull(),
	fullName: varchar("full_name", { length: 255 }).notNull(),
	nationalId: varchar("national_id", { length: 20 }),
	phone: varchar({ length: 20 }),
	groupId: int("group_id").references(() => groups.id, { onDelete: "set null", onUpdate: "cascade" } ),
	jobId: int("job_id"),
	dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }),
	photoUrl: text("photo_url"),
	qrToken: varchar("qr_token", { length: 100 }),
	manualCode: varchar("manual_code", { length: 20 }),
	status: mysqlEnum(['active','inactive','archived']).default('active'),
	lastAttendanceAt: timestamp("last_attendance_at", { mode: 'string' }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	hireDate: date("hire_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("workers_code_unique").on(table.code),
]);

export const notifications = mysqlTable("notifications", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	type: mysqlEnum("type", ['success', 'warning', 'info', 'error']).default('info').notNull(),
	link: varchar({ length: 255 }),
	isRead: tinyint("is_read").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_notifications_user_id").on(table.userId),
	index("idx_notifications_is_read").on(table.isRead),
]);

export const pushSubscriptions = mysqlTable("push_subscriptions", {
	id: int().autoincrement().notNull(),
	userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	endpoint: text().notNull(),
	p256dh: varchar({ length: 255 }).notNull(),
	auth: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_push_subs_user_id").on(table.userId),
]);
