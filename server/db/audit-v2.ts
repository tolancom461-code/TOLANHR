import crypto from "crypto";
import { auditLogV2 } from "../../drizzle/schema";
import { getDb } from "./connection";

// ============================================================
// AuditService (audit_log_v2)
// خدمة مركزية وحيدة لكتابة سجل التدقيق الجديد.
// ممنوع كتابة INSERT إلى audit_log_v2 من أي مكان آخر في التطبيق
// (راجع وثيقة المتطلبات، قسم 11: "منع كتابة SQL مباشر إلى جدول
// التدقيق من شاشات متعددة").
// ============================================================

export type ActionCategory =
  | 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'
  | 'APPROVE' | 'REJECT'
  | 'ACTIVATE' | 'DEACTIVATE' | 'ARCHIVE'
  | 'ASSIGN' | 'TRANSFER'
  | 'IMPORT' | 'EXPORT'
  | 'RECALCULATE'
  | 'GRANT_PERMISSION' | 'REVOKE_PERMISSION' | 'CHANGE_ROLE';

export type AuditSource = 'WEB' | 'MOBILE' | 'API' | 'SYSTEM' | 'IMPORT';

// الأعمال التي يوجب فيها السبب (reason_text) حسب قسم 4 و7 بالوثيقة.
const REASON_REQUIRED_CATEGORIES: ReadonlySet<ActionCategory> = new Set([
  'DELETE', 'RESTORE', 'REJECT', 'DEACTIVATE', 'ARCHIVE',
  'GRANT_PERMISSION', 'REVOKE_PERMISSION', 'CHANGE_ROLE', 'TRANSFER',
]);

// ============================================================
// إخفاء الحقول السرية (SEC-004 / FR-015)
// أي حقل بهذه القائمة يُحذف بالكامل من اللقطات قبل الحفظ، ولا يظهر
// حتى كـ "قيمة مخفية" — يُحذف نهائياً من الكائن.
// ============================================================
const SECRET_FIELD_DENYLIST = new Set([
  'password', 'passwordHash', 'password_hash',
  'accessToken', 'access_token',
  'refreshToken', 'refresh_token',
  'sessionToken', 'session_token',
  'qrToken', 'qr_token',
  'apiKey', 'api_key',
  'secret', 'secretKey', 'secret_key',
  'token', 'otp', 'otpCode', 'otp_code',
]);

function redactSecrets<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(redactSecrets) as unknown as T;
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, any>)) {
      if (SECRET_FIELD_DENYLIST.has(key)) continue;
      out[key] = redactSecrets(value);
    }
    return out as T;
  }
  return input;
}

// ============================================================
// لقطة هوية المنفذ (actor_snapshot) — FR-006
// تُحفظ ثابتة وقت العملية، ولا تتأثر بتعديل حساب المستخدم لاحقاً.
// ============================================================
export interface ActorInfo {
  id: number | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  loginMethod?: string | null;
}

function buildActorSnapshot(actor: ActorInfo | null): Record<string, any> {
  if (!actor || actor.id === null || actor.id === undefined) {
    return { type: 'SYSTEM' };
  }
  return {
    type: 'USER',
    id: actor.id,
    fullName: actor.fullName ?? null,
    username: actor.username ?? null,
    email: actor.email ?? null,
    role: actor.role ?? null,
    loginMethod: actor.loginMethod ?? null,
  };
}

// ============================================================
// استخراج changed_fields تلقائياً (FR-005)
// يقارن قبل/بعد ويرجع فقط الحقول المختلفة فعلياً.
// ============================================================
export function diffChangedFields(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  allowedFields?: string[]
): Record<string, { old: any; new: any }> | null {
  if (!before || !after) return null;
  const keys = allowedFields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: Record<string, { old: any; new: any }> = {};
  for (const key of keys) {
    if (SECRET_FIELD_DENYLIST.has(key)) continue;
    const oldVal = before[key] === undefined ? null : before[key];
    const newVal = after[key] === undefined ? null : after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// ============================================================
// بصمة السجل (row_hash) — SEC-006
// بصمة مستقلة لكل سجل (بدون سلسلة صارمة previous_hash لتفادي
// اختناق الأداء تحت الكتابة المتزامنة على TiDB). previous_hash
// محجوز للمرحلة الثانية (نقاط تفتيش دورية بدل تسلسل لكل سجل).
// ============================================================
function computeRowHash(fields: Record<string, any>): string {
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ============================================================
// استخراج IP / User-Agent من الطلب مركزياً (يعالج فجوة real code:
// كان يُمرَّر يدوياً في ملف واحد فقط سابقاً)
// ============================================================
export function extractRequestMeta(req: any): { ipAddress: string | null; userAgent: string | null } {
  if (!req) return { ipAddress: null, userAgent: null };
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const ipAddress =
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0]?.trim() : null) ||
    req.socket?.remoteAddress ||
    req.ip ||
    null;
  const userAgent = req.headers?.['user-agent'] || null;
  return { ipAddress, userAgent };
}

// ============================================================
// المعامل الرئيسي
// ============================================================
export interface LogAuditV2Params {
  actionCategory: ActionCategory;
  /** اسم عملي تفصيلي، مثال: UPDATE_WORKER_GROUP */
  actionName: string;
  /** وصف عربي مقروء جاهز للعرض مباشرة بشاشة التفاصيل */
  description: string;
  tableName: string;
  entityType: string;
  recordId?: number | null;
  /** كودات تعريفية ثابتة، مثال: { workerCode: 'W109' } */
  recordKey: Record<string, any>;

  actor: ActorInfo | null;
  source?: AuditSource;
  /** كائن Express Request لاستخراج IP و User-Agent تلقائياً */
  req?: any;

  requestId: string;
  transactionId?: string | null;
  parentEventUuid?: string | null;
  batchId?: string | null;

  beforeValues?: Record<string, any> | null;
  afterValues?: Record<string, any> | null;
  /** لو لم تُمرَّر، تُحسب تلقائياً من before/after */
  changedFields?: Record<string, any> | null;
  /** لو مُمرَّرة، يقتصر الفرق على هذه الحقول فقط (allow-list) */
  allowedFields?: string[];

  reasonCode?: string | null;
  reasonText?: string | null;

  businessEventAt?: string | null;
  recordCreatedAt?: string | null;
  recordUpdatedAt?: string | null;
  recordDeletedAt?: string | null;

  metadata?: Record<string, any> | null;
  legacyAuditId?: number | null;

  /**
   * معاملة Drizzle (db.transaction) لضمان الذرية مع العملية الأصلية.
   * لو مُررت ونجحت الكتابة → تصير جزءاً من نفس commit.
   * لو مُررت وفشلت الكتابة → يُرمى الخطأ فيتراجع كل شيء (rollback).
   * لو لم تُمرَّر (توافقاً مع الراوترات غير المحوّلة بعد) → best-effort،
   * لا يوقف العملية الأصلية عند الفشل (مطابق لسلوك logAudit القديم).
   */
  tx?: any;
}

export async function logAuditV2(params: LogAuditV2Params): Promise<{ eventUuid: string } | null> {
  // فرض السبب الإلزامي (FR-008 / قسم 4)
  if (REASON_REQUIRED_CATEGORIES.has(params.actionCategory) && !params.reasonText) {
    const err = new Error(
      `[AuditV2] reason_text إلزامي للعملية ${params.actionName} (نوعها ${params.actionCategory})`
    );
    // هذا الخطأ يجب أن يوقف العملية دائماً (حتى بدون tx) — سبب مفقود
    // لعملية حساسة هو خطأ برمجي في نقطة الاستدعاء، وليس فشل تدقيق عادي.
    throw err;
  }

  try {
    const db = params.tx ?? (await getDb());
    if (!db) {
      console.error('[AuditV2] قاعدة البيانات غير متاحة — لم يُسجَّل التدقيق');
      if (params.tx) throw new Error('[AuditV2] Database not available inside transaction');
      return null;
    }

    const eventUuid = crypto.randomUUID();
    const { ipAddress, userAgent } = extractRequestMeta(params.req);

    const cleanBefore = params.beforeValues ? redactSecrets(params.beforeValues) : null;
    const cleanAfter = params.afterValues ? redactSecrets(params.afterValues) : null;
    const changedFields =
      params.changedFields !== undefined
        ? params.changedFields
        : diffChangedFields(cleanBefore, cleanAfter, params.allowedFields);

    const actorSnapshot = buildActorSnapshot(params.actor);

    const rowHash = computeRowHash({
      eventUuid,
      actionName: params.actionName,
      tableName: params.tableName,
      recordId: params.recordId ?? null,
      actorUserId: params.actor?.id ?? null,
      beforeValues: cleanBefore,
      afterValues: cleanAfter,
    });

    await db.insert(auditLogV2).values({
      eventUuid,
      businessEventAt: params.businessEventAt ?? null,
      actionCategory: params.actionCategory,
      actionName: params.actionName,
      description: params.description,
      tableName: params.tableName,
      entityType: params.entityType,
      recordId: params.recordId ?? null,
      recordKey: params.recordKey ?? {},
      actorUserId: params.actor?.id ?? null,
      actorSnapshot,
      source: params.source ?? 'WEB',
      ipAddress,
      userAgent,
      requestId: params.requestId,
      transactionId: params.transactionId ?? null,
      parentEventUuid: params.parentEventUuid ?? null,
      batchId: params.batchId ?? null,
      beforeValues: cleanBefore,
      afterValues: cleanAfter,
      changedFields,
      reasonCode: params.reasonCode ?? null,
      reasonText: params.reasonText ?? null,
      recordCreatedAt: params.recordCreatedAt ?? null,
      recordUpdatedAt: params.recordUpdatedAt ?? null,
      recordDeletedAt: params.recordDeletedAt ?? null,
      metadata: params.metadata ?? null,
      legacyAuditId: params.legacyAuditId ?? null,
      rowHash,
      previousHash: null,
      schemaVersion: 1,
    });

    return { eventUuid };
  } catch (error) {
    console.error('[AuditV2] فشل تسجيل التدقيق:', error);
    if (params.tx) {
      // داخل معاملة: نرمي الخطأ ليتراجع كل شيء معاً (مبدأ الذرية، FR الأساسي).
      throw error;
    }
    // خارج معاملة (توافقية مؤقتة مع الراوترات غير المحوّلة بعد): لا نوقف العملية.
    return null;
  }
}

// ============================================================
// دالة مساعدة: تحويل مستخدم tRPC (ctx.user) إلى ActorInfo
// ============================================================
export function actorFromUser(user: {
  id: number;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  loginMethod?: string | null;
} | null | undefined): ActorInfo | null {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName ?? null,
    username: user.username ?? null,
    email: user.email ?? null,
    role: user.role ?? null,
    loginMethod: user.loginMethod ?? null,
  };
}
