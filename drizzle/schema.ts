import { mysqlTable, mysqlSchema, AnyMySqlColumn, index, uniqueIndex, foreignKey, int, bigint, smallint, decimal, date, datetime, char, json, mysqlEnum, text, timestamp, varchar, tinyint, unique, primaryKey } from "drizzle-orm/mysql-core"
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

// Reflects the manually-created TiDB table used by the main-app Final Events consumer.
// TiDB is the source of truth; do not push/migrate this definition automatically.
export const biometricFinalEventImports = mysqlTable("biometric_final_event_imports", {
	id: bigint({ mode: 'number' }).autoincrement().notNull(),
	eventUuid: char("event_uuid", { length: 36 }).notNull(),
	personCode: varchar("person_code", { length: 100 }).notNull(),
	workerId: int("worker_id"),
	eventType: varchar("event_type", { length: 50 }).notNull(),
	eventTimeUtc: datetime("event_time_utc", { mode: 'string', fsp: 6 }).notNull(),
	status: varchar({ length: 50 }).notNull(),
	attendanceEventId: int("attendance_event_id"),
	message: varchar({ length: 500 }),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	// Actual TiDB column has ON UPDATE CURRENT_TIMESTAMP(6). Omitted here because
	// drizzle-orm 0.44.x does not expose datetime().onUpdateNow().
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_final_event_uuid").on(table.eventUuid),
	index("idx_biometric_import_worker").on(table.workerId),
	index("idx_biometric_import_status").on(table.status),
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

// ============================================
// سجل التدقيق الجديد (Audit Log V2)
// جدول مستقل تماماً عن audit_log القديم — append-only، لا يُعدَّل ولا يُحذف من التطبيق.
// راجع: وثيقة متطلبات سجل التدقيق الجديد v1.0
// ============================================
export const auditLogV2 = mysqlTable("audit_log_v2", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),

	// هوية الحدث
	eventUuid: char("event_uuid", { length: 36 }).notNull(),
	loggedAt: datetime("logged_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	businessEventAt: datetime("business_event_at", { mode: 'string', fsp: 6 }),

	// تصنيف العملية
	actionCategory: varchar("action_category", { length: 32 }).notNull(),
	actionName: varchar("action_name", { length: 100 }).notNull(),
	description: varchar({ length: 500 }).notNull(),

	// الكيان المتأثر
	schemaName: varchar("schema_name", { length: 64 }).default('tolan_workforce').notNull(),
	tableName: varchar("table_name", { length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 100 }).notNull(),
	recordId: bigint("record_id", { mode: 'number' }),
	recordKey: json("record_key").notNull(),

	// المنفذ ومصدر العملية
	actorUserId: bigint("actor_user_id", { mode: 'number' }),
	actorSnapshot: json("actor_snapshot").notNull(),
	source: varchar({ length: 32 }).default('WEB').notNull(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	sessionId: varchar("session_id", { length: 100 }),
	requestId: char("request_id", { length: 36 }).notNull(),
	transactionId: char("transaction_id", { length: 36 }),
	parentEventUuid: char("parent_event_uuid", { length: 36 }),
	batchId: varchar("batch_id", { length: 100 }),

	// القيم والتغييرات
	beforeValues: json("before_values"),
	afterValues: json("after_values"),
	changedFields: json("changed_fields"),
	reasonCode: varchar("reason_code", { length: 50 }),
	reasonText: varchar("reason_text", { length: 500 }),

	// تواريخ السجل الأصلي المتأثر
	recordCreatedAt: datetime("record_created_at", { mode: 'string', fsp: 6 }),
	recordUpdatedAt: datetime("record_updated_at", { mode: 'string', fsp: 6 }),
	recordDeletedAt: datetime("record_deleted_at", { mode: 'string', fsp: 6 }),

	// إضافات ومنع العبث
	metadata: json(),
	legacyAuditId: bigint("legacy_audit_id", { mode: 'number' }),
	rowHash: char("row_hash", { length: 64 }).notNull(),
	previousHash: char("previous_hash", { length: 64 }),
	schemaVersion: smallint("schema_version").default(1).notNull(),
},
(table) => [
	uniqueIndex("uq_audit_v2_event_uuid").on(table.eventUuid),
	index("idx_audit_v2_entity_lookup").on(table.tableName, table.recordId, table.loggedAt),
	index("idx_audit_v2_actor").on(table.actorUserId),
	index("idx_audit_v2_action").on(table.actionName),
	index("idx_audit_v2_request").on(table.requestId),
	index("idx_audit_v2_parent_event").on(table.parentEventUuid),
	index("idx_audit_v2_batch").on(table.batchId),
	index("idx_audit_v2_logged_at").on(table.loggedAt),
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


// ============================================
// جداول biometric-service الفعلية في TiDB — محدثة 2026-08-31
// الجداول البيومترية القديمة حُذفت، وهذه التعريفات تعكس الجداول العشرة
// الموجودة فعلياً الآن داخل قاعدة test والمملوكة لـ biometric-service.
// لا توجد Foreign Keys أو روابط إلى workers / attendance / finance.
// ملاحظة: Collation الفعلية على مستوى الجدول هي utf8mb4_bin حسب SHOW CREATE TABLE؛
// Drizzle schema هنا يعكس الأعمدة والقيود والفهارس، وليس إعداد Collation الجدولي.
// ============================================
export const biometricSvcDevices = mysqlTable("biometric_svc_devices", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	vendor: varchar({ length: 64 }).notNull(),
	serialNumber: varchar("serial_number", { length: 128 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	manufacturer: varchar({ length: 128 }),
	model: varchar({ length: 128 }),
	protocol: varchar({ length: 64 }),
	adapterType: varchar("adapter_type", { length: 64 }),
	mode: varchar({ length: 32 }).default('test').notNull(),
	status: varchar({ length: 32 }).default('active').notNull(),
	timezone: varchar({ length: 100 }).default('Asia/Riyadh').notNull(),
	acceptEventsFrom: datetime("accept_events_from", { mode: 'string', fsp: 6 }),
	firmwareVersion: varchar("firmware_version", { length: 160 }),
	platform: varchar({ length: 128 }),
	oemVendor: varchar("oem_vendor", { length: 128 }),
	firstSeenAt: datetime("first_seen_at", { mode: 'string', fsp: 6 }),
	lastSeenAt: datetime("last_seen_at", { mode: 'string', fsp: 6 }),
	lastEventAt: datetime("last_event_at", { mode: 'string', fsp: 6 }),
	lastIpAddress: varchar("last_ip_address", { length: 45 }),
	safeCapabilities: json("safe_capabilities"),
	notes: text(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_devices_vendor_serial").on(table.vendor, table.serialNumber),
	index("idx_biometric_svc_devices_status").on(table.status),
	index("idx_biometric_svc_devices_last_seen").on(table.lastSeenAt),
	index("idx_biometric_svc_devices_last_event").on(table.lastEventAt),
]);

export const biometricSvcIngestEvents = mysqlTable("biometric_svc_ingest_events", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	ingestKey: char("ingest_key", { length: 64 }).notNull(),
	storageIdentityVersion: varchar("storage_identity_version", { length: 32 }).notNull(),
	deviceId: bigint("device_id", { mode: 'number', unsigned: true }).notNull(),
	vendor: varchar({ length: 64 }).notNull(),
	serialNumber: varchar("serial_number", { length: 128 }).notNull(),
	eventFamily: varchar("event_family", { length: 64 }).notNull(),
	vendorEventType: varchar("vendor_event_type", { length: 64 }).notNull(),
	vendorEventId: varchar("vendor_event_id", { length: 255 }),
	dedupeKey: varchar("dedupe_key", { length: 255 }).notNull(),
	dedupeStrategy: varchar("dedupe_strategy", { length: 100 }).notNull(),
	dedupeVersion: varchar("dedupe_version", { length: 32 }).notNull(),
	wireHash: char("wire_hash", { length: 64 }).notNull(),
	captureId: char("capture_id", { length: 36 }),
	captureIndex: int("capture_index", { unsigned: true }),
	adapterVersion: varchar("adapter_version", { length: 128 }),
	parserVersion: varchar("parser_version", { length: 128 }).notNull(),
	parseValid: tinyint("parse_valid", { unsigned: true }).notNull(),
	safeToAcknowledge: tinyint("safe_to_acknowledge", { unsigned: true }).notNull(),
	unsafeReason: varchar("unsafe_reason", { length: 255 }),
	sourceBytes: int("source_bytes", { unsigned: true }),
	sourceFieldCount: smallint("source_field_count", { unsigned: true }),
	payloadSchemaVersion: smallint("payload_schema_version", { unsigned: true }).default(1).notNull(),
	safePayload: json("safe_payload"),
	sourceIp: varchar("source_ip", { length: 45 }),
	receivedAt: datetime("received_at", { mode: 'string', fsp: 6 }).notNull(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_ingest_key").on(table.ingestKey),
	uniqueIndex("uq_biometric_svc_ingest_vendor_identity").on(table.deviceId, table.dedupeStrategy, table.dedupeVersion, table.dedupeKey),
	index("idx_biometric_svc_ingest_device_received").on(table.deviceId, table.receivedAt),
	index("idx_biometric_svc_ingest_wire_hash").on(table.wireHash),
	index("idx_biometric_svc_ingest_capture").on(table.captureId),
	index("idx_biometric_svc_ingest_ack").on(table.safeToAcknowledge, table.receivedAt),
]);

export const biometricSvcEventProcessing = mysqlTable("biometric_svc_event_processing", {
	ingestEventId: bigint("ingest_event_id", { mode: 'number', unsigned: true }).notNull(),
	status: varchar({ length: 32 }).default('pending').notNull(),
	attemptCount: int("attempt_count", { unsigned: true }).default(0).notNull(),
	nextAttemptAt: datetime("next_attempt_at", { mode: 'string', fsp: 6 }),
	lastAttemptAt: datetime("last_attempt_at", { mode: 'string', fsp: 6 }),
	leaseOwner: varchar("lease_owner", { length: 128 }),
	leaseToken: char("lease_token", { length: 36 }),
	leaseExpiresAt: datetime("lease_expires_at", { mode: 'string', fsp: 6 }),
	lastErrorCode: varchar("last_error_code", { length: 100 }),
	lastErrorMessage: varchar("last_error_message", { length: 1000 }),
	processedAt: datetime("processed_at", { mode: 'string', fsp: 6 }),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	primaryKey({ columns: [table.ingestEventId] }),
	index("idx_biometric_svc_processing_work").on(table.status, table.nextAttemptAt, table.leaseExpiresAt),
	index("idx_biometric_svc_processing_lease").on(table.leaseToken),
]);

export const biometricSvcPunches = mysqlTable("biometric_svc_punches", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	ingestEventId: bigint("ingest_event_id", { mode: 'number', unsigned: true }).notNull(),
	eventKey: char("event_key", { length: 64 }).notNull(),
	eventKeyStrategy: varchar("event_key_strategy", { length: 100 }).notNull(),
	eventKeyVersion: varchar("event_key_version", { length: 32 }).notNull(),
	vendorDedupeKey: varchar("vendor_dedupe_key", { length: 255 }).notNull(),
	vendorDedupeStrategy: varchar("vendor_dedupe_strategy", { length: 100 }).notNull(),
	vendorDedupeVersion: varchar("vendor_dedupe_version", { length: 32 }).notNull(),
	deviceId: bigint("device_id", { mode: 'number', unsigned: true }).notNull(),
	vendor: varchar({ length: 64 }).notNull(),
	serialNumber: varchar("serial_number", { length: 128 }).notNull(),
	deviceUserId: varchar("device_user_id", { length: 128 }).notNull(),
	deviceEventTimeRaw: varchar("device_event_time_raw", { length: 64 }).notNull(),
	deviceEventTimeLocal: datetime("device_event_time_local", { mode: 'string', fsp: 6 }).notNull(),
	deviceTimezone: varchar("device_timezone", { length: 100 }),
	deviceEventTimeUtc: datetime("device_event_time_utc", { mode: 'string', fsp: 6 }),
	rawStatus: varchar("raw_status", { length: 32 }),
	punchState: varchar("punch_state", { length: 64 }),
	rawVerify: varchar("raw_verify", { length: 32 }),
	verificationMethod: varchar("verification_method", { length: 64 }),
	workCode: varchar("work_code", { length: 100 }),
	canonicalSchemaVersion: smallint("canonical_schema_version", { unsigned: true }).default(1).notNull(),
	vendorMetadata: json("vendor_metadata"),
	wireHash: char("wire_hash", { length: 64 }).notNull(),
	parserVersion: varchar("parser_version", { length: 128 }).notNull(),
	receivedAt: datetime("received_at", { mode: 'string', fsp: 6 }).notNull(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_punch_ingest").on(table.ingestEventId),
	uniqueIndex("uq_biometric_svc_punch_event").on(table.eventKey),
	index("idx_biometric_svc_punch_device_time").on(table.deviceId, table.deviceEventTimeLocal),
	index("idx_biometric_svc_punch_user_time").on(table.deviceId, table.deviceUserId, table.deviceEventTimeLocal),
	index("idx_biometric_svc_punch_utc").on(table.deviceEventTimeUtc),
	index("idx_biometric_svc_punch_received").on(table.receivedAt),
]);

export const biometricSvcDeviceUsers = mysqlTable("biometric_svc_device_users", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	deviceId: bigint("device_id", { mode: 'number', unsigned: true }).notNull(),
	deviceUserId: varchar("device_user_id", { length: 128 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	status: varchar({ length: 32 }).default('seen').notNull(),
	metadataSchemaVersion: smallint("metadata_schema_version", { unsigned: true }).default(1).notNull(),
	safeMetadata: json("safe_metadata"),
	firstSeenAt: datetime("first_seen_at", { mode: 'string', fsp: 6 }),
	lastSeenAt: datetime("last_seen_at", { mode: 'string', fsp: 6 }),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_device_user").on(table.deviceId, table.deviceUserId),
	index("idx_biometric_svc_device_users_status").on(table.deviceId, table.status),
	index("idx_biometric_svc_device_users_last_seen").on(table.lastSeenAt),
]);


// ============================================
// طبقة الإدارة المستقلة والنتائج النهائية لـ biometric-service
// أضيفت فعلياً إلى TiDB بتاريخ 2026-08-31.
// تبقى مستقلة تماماً عن workers / attendance / finance / payroll / QR.
// لا توجد Foreign Keys إلى النظام الرئيسي.
// ============================================
export const biometricSvcPeople = mysqlTable("biometric_svc_people", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	personCode: varchar("person_code", { length: 64 }).notNull(),
	displayName: varchar("display_name", { length: 255 }).notNull(),
	status: varchar({ length: 32 }).default('active').notNull(),
	notes: text(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_people_person_code").on(table.personCode),
	index("idx_biometric_svc_people_status").on(table.status),
]);

export const biometricSvcPersonDeviceUsers = mysqlTable("biometric_svc_person_device_users", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	personId: bigint("person_id", { mode: 'number', unsigned: true }).notNull(),
	deviceUserRowId: bigint("device_user_row_id", { mode: 'number', unsigned: true }).notNull(),
	status: varchar({ length: 32 }).default('active').notNull(),
	activeFrom: datetime("active_from", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	activeTo: datetime("active_to", { mode: 'string', fsp: 6 }),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_person_device_users_device_user").on(table.deviceUserRowId),
	index("idx_biometric_svc_person_device_users_person").on(table.personId),
	index("idx_biometric_svc_person_device_users_status").on(table.status),
	index("idx_biometric_svc_person_device_users_active").on(table.personId, table.status, table.activeTo),
]);

export const biometricSvcFinalEvents = mysqlTable("biometric_svc_final_events", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	finalEventUuid: char("final_event_uuid", { length: 36 }).notNull(),
	personId: bigint("person_id", { mode: 'number', unsigned: true }).notNull(),
	personCode: varchar("person_code", { length: 64 }).notNull(),
	sourcePunchId: bigint("source_punch_id", { mode: 'number', unsigned: true }).notNull(),
	deviceId: bigint("device_id", { mode: 'number', unsigned: true }).notNull(),
	deviceReference: varchar("device_reference", { length: 255 }).notNull(),
	eventType: varchar("event_type", { length: 64 }).notNull(),
	eventTimeLocal: datetime("event_time_local", { mode: 'string', fsp: 6 }).notNull(),
	eventTimezone: varchar("event_timezone", { length: 100 }).notNull(),
	eventTimeUtc: datetime("event_time_utc", { mode: 'string', fsp: 6 }).notNull(),
	verificationMethod: varchar("verification_method", { length: 64 }),
	finalizationVersion: varchar("finalization_version", { length: 32 }).notNull(),
	status: varchar({ length: 32 }).default('final').notNull(),
	safeMetadata: json("safe_metadata"),
	finalizedAt: datetime("finalized_at", { mode: 'string', fsp: 6 }).notNull(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_final_events_uuid").on(table.finalEventUuid),
	uniqueIndex("uq_biometric_svc_final_events_source_version").on(table.sourcePunchId, table.finalizationVersion),
	index("idx_biometric_svc_final_events_person_time").on(table.personId, table.eventTimeUtc),
	index("idx_biometric_svc_final_events_person_code_time").on(table.personCode, table.eventTimeUtc),
	index("idx_biometric_svc_final_events_device_time").on(table.deviceId, table.eventTimeUtc),
	index("idx_biometric_svc_final_events_status_finalized").on(table.status, table.finalizedAt),
	index("idx_biometric_svc_final_events_event_time_utc").on(table.eventTimeUtc),
]);

export const biometricSvcFinalizationIssues = mysqlTable("biometric_svc_finalization_issues", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	sourcePunchId: bigint("source_punch_id", { mode: 'number', unsigned: true }).notNull(),
	issueType: varchar("issue_type", { length: 64 }).notNull(),
	status: varchar({ length: 32 }).default('open').notNull(),
	details: json(),
	firstSeenAt: datetime("first_seen_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	lastSeenAt: datetime("last_seen_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	resolvedAt: datetime("resolved_at", { mode: 'string', fsp: 6 }),
	resolutionNote: varchar("resolution_note", { length: 1000 }),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	updatedAt: datetime("updated_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	uniqueIndex("uq_biometric_svc_finalization_issues_source_type").on(table.sourcePunchId, table.issueType),
	index("idx_biometric_svc_finalization_issues_status").on(table.status),
	index("idx_biometric_svc_finalization_issues_type_status").on(table.issueType, table.status),
	index("idx_biometric_svc_finalization_issues_last_seen").on(table.lastSeenAt),
]);

export const biometricSvcAuditLog = mysqlTable("biometric_svc_audit_log", {
	id: bigint({ mode: 'number', unsigned: true }).autoincrement().notNull(),
	actorType: varchar("actor_type", { length: 32 }).notNull(),
	actorReference: varchar("actor_reference", { length: 128 }),
	actionType: varchar("action_type", { length: 64 }).notNull(),
	entityType: varchar("entity_type", { length: 64 }).notNull(),
	entityId: bigint("entity_id", { mode: 'number', unsigned: true }),
	beforeState: json("before_state"),
	afterState: json("after_state"),
	notes: varchar({ length: 1000 }),
	occurredAt: datetime("occurred_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
	createdAt: datetime("created_at", { mode: 'string', fsp: 6 }).default(sql`CURRENT_TIMESTAMP(6)`).notNull(),
},
(table) => [
	index("idx_biometric_svc_audit_log_actor").on(table.actorType, table.actorReference),
	index("idx_biometric_svc_audit_log_action").on(table.actionType),
	index("idx_biometric_svc_audit_log_entity").on(table.entityType, table.entityId),
	index("idx_biometric_svc_audit_log_occurred_at").on(table.occurredAt),
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
	notes: text(),
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
	// ✅ الحسومات الإدارية المرحّلة من شاشة "الحسومات" (منفصلة عن خصومات التأخير/الخروج المبكر التلقائية)
	otherDeductions: decimal("other_deductions", { precision: 10, scale: 2 }).default('0.00'),
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

// ✅ شاشة "الحسومات": حسومات إدارية يعتمدها المستخدم، وتترحّل تلقائياً لدفعة العمال المطابقة لتاريخ استحقاقها
export const deductionEntries = mysqlTable("deduction_entries", {
	id: int().autoincrement().notNull(),
	workerId: int("worker_id").notNull().references(() => workers.id, { onDelete: "cascade", onUpdate: "cascade" } ),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	// تاريخ الاستحقاق: يحدد أي دفعة عمال (بحسب فترتها) سيُرحَّل إليها هذا الحسم
	dueDate: date("due_date", { mode: 'string' }).notNull(),
	reason: text().notNull(),
	status: mysqlEnum(['pending','approved','posted']).default('pending').notNull(),
	approvedBy: int("approved_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	// الدفعة التي تم ترحيل هذا الحسم إليها فعلياً (يمنع تكرار الترحيل)
	postedBatchId: int("posted_batch_id").references(() => payrollBatches.id, { onDelete: "set null", onUpdate: "cascade" } ),
	postedAt: timestamp("posted_at", { mode: 'string' }),
	createdBy: int("created_by").references(() => users.id, { onDelete: "set null", onUpdate: "cascade" } ),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_deduction_entries_worker_id").on(table.workerId),
	index("idx_deduction_entries_due_date").on(table.dueDate),
	index("idx_deduction_entries_status").on(table.status),
	index("idx_deduction_entries_posted_batch").on(table.postedBatchId),
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
	// ✅ إجمالي الحسومات الإدارية المرحّلة من شاشة "الحسومات" لهذه الدفعة
	totalOtherDeductions: decimal("total_other_deductions", { precision: 12, scale: 2 }).default('0.00'),
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
	role: mysqlEnum(['guard','supervisor','supervisor_tolan','supervisor_malqa','admin_affairs','accountant','auditor','finance_manager','executive','super_admin','restaurant_operations','data_entry']).default('guard').notNull(),
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
	// Reflects the column/index already created manually in the actual TiDB database.
	// TiDB remains the source of truth; do not use this file to push schema changes.
	biometricPersonCode: varchar("biometric_person_code", { length: 100 }),
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
	uniqueIndex("uq_workers_biometric_person_code").on(table.biometricPersonCode),
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
