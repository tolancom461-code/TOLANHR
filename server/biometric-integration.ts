const DEFAULT_BIOMETRIC_API_URL = 'http://127.0.0.1:9097/api/v1';
const REQUEST_TIMEOUT_MS = 5000;

export type BiometricDirectoryPerson = {
  personCode: string;
  displayName: string;
  status: string;
};

export type BiometricDirectoryPage = {
  afterCode: string;
  nextAfterCode: string;
  limit: number;
  hasMore: boolean;
};

export type BiometricDirectoryResponse = {
  apiVersion: 'v1';
  items: BiometricDirectoryPerson[];
  page: BiometricDirectoryPage;
};

export type BiometricFinalEvent = {
  eventId: string;
  personCode: string;
  eventType: string;
  eventTimeUtc: string;
  eventTimeLocal: string;
  eventTimezone: string;
  verificationMethod: string | null;
  finalizationVersion: string;
};

export type BiometricFinalEventsPage = {
  afterId: string;
  nextAfterId: string;
  limit: number;
  hasMore: boolean;
};

export type BiometricFinalEventsResponse = {
  apiVersion: 'v1';
  items: BiometricFinalEvent[];
  page: BiometricFinalEventsPage;
};

export class BiometricIntegrationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_CONFIGURED'
      | 'AUTH_FAILED'
      | 'UNAVAILABLE'
      | 'BAD_RESPONSE',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'BiometricIntegrationError';
  }
}

function getBiometricApiConfig() {
  const baseUrl = (process.env.BIOMETRIC_SERVICE_API_URL || DEFAULT_BIOMETRIC_API_URL).replace(/\/+$/, '');
  const token = process.env.BIOMETRIC_SERVICE_API_TOKEN || process.env.BIOMETRIC_FINAL_EVENTS_API_TOKEN || '';

  if (!token) {
    throw new BiometricIntegrationError(
      'لم يتم إعداد رمز اتصال نظام البصمة في البرنامج الرئيسي',
      'NOT_CONFIGURED',
    );
  }

  return { baseUrl, token };
}

function assertSafeDirectoryResponse(value: any): BiometricDirectoryResponse {
  if (!value || value.apiVersion !== 'v1' || !Array.isArray(value.items) || !value.page) {
    throw new BiometricIntegrationError('استجابة دليل البصمة غير متوقعة', 'BAD_RESPONSE');
  }

  const items: BiometricDirectoryPerson[] = value.items.map((item: any) => {
    if (
      !item ||
      typeof item.personCode !== 'string' ||
      typeof item.displayName !== 'string' ||
      typeof item.status !== 'string'
    ) {
      throw new BiometricIntegrationError('بيانات دليل البصمة غير صالحة', 'BAD_RESPONSE');
    }

    return {
      personCode: item.personCode,
      displayName: item.displayName,
      status: item.status,
    };
  });

  const page = value.page;
  if (
    typeof page.afterCode !== 'string' ||
    typeof page.nextAfterCode !== 'string' ||
    typeof page.limit !== 'number' ||
    typeof page.hasMore !== 'boolean'
  ) {
    throw new BiometricIntegrationError('بيانات صفحة دليل البصمة غير صالحة', 'BAD_RESPONSE');
  }

  return {
    apiVersion: 'v1',
    items,
    page: {
      afterCode: page.afterCode,
      nextAfterCode: page.nextAfterCode,
      limit: page.limit,
      hasMore: page.hasMore,
    },
  };
}

export async function searchBiometricDirectory(input?: {
  search?: string;
  afterCode?: string;
  limit?: number;
}): Promise<BiometricDirectoryResponse> {
  const { baseUrl, token } = getBiometricApiConfig();
  const url = new URL(`${baseUrl}/person-directory`);

  const search = input?.search?.trim();
  const afterCode = input?.afterCode?.trim();
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 100);

  if (search) url.searchParams.set('search', search);
  if (afterCode) url.searchParams.set('after_code', afterCode);
  url.searchParams.set('limit', String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new BiometricIntegrationError(
        'تعذر المصادقة مع نظام البصمة',
        'AUTH_FAILED',
        response.status,
      );
    }

    if (!response.ok) {
      throw new BiometricIntegrationError(
        'نظام البصمة غير متاح حاليًا',
        'UNAVAILABLE',
        response.status,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new BiometricIntegrationError('استجابة نظام البصمة غير صالحة', 'BAD_RESPONSE');
    }

    return assertSafeDirectoryResponse(json);
  } catch (error: any) {
    if (error instanceof BiometricIntegrationError) throw error;
    if (error?.name === 'AbortError') {
      throw new BiometricIntegrationError('انتهت مهلة الاتصال بنظام البصمة', 'UNAVAILABLE');
    }
    throw new BiometricIntegrationError('تعذر الاتصال بنظام البصمة', 'UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBiometricPersonByCode(personCode: string): Promise<BiometricDirectoryPerson | null> {
  const normalizedCode = personCode.trim();
  if (!normalizedCode) return null;

  const result = await searchBiometricDirectory({ search: normalizedCode, limit: 50 });
  return result.items.find((item) => item.personCode === normalizedCode) ?? null;
}

function assertCursor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new BiometricIntegrationError(`قيمة ${field} في استجابة البصمة غير صالحة`, 'BAD_RESPONSE');
  }
  return value;
}

function assertSafeFinalEventsResponse(value: any): BiometricFinalEventsResponse {
  if (!value || value.apiVersion !== 'v1' || !Array.isArray(value.items) || !value.page) {
    throw new BiometricIntegrationError('استجابة أحداث البصمة غير متوقعة', 'BAD_RESPONSE');
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
  const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

  const items: BiometricFinalEvent[] = value.items.map((item: any) => {
    if (
      !item ||
      typeof item.eventId !== 'string' || !uuidPattern.test(item.eventId) ||
      typeof item.personCode !== 'string' || !item.personCode.trim() || item.personCode.length > 100 ||
      typeof item.eventType !== 'string' || !item.eventType.trim() || item.eventType.length > 50 ||
      typeof item.eventTimeUtc !== 'string' || !utcPattern.test(item.eventTimeUtc) ||
      typeof item.eventTimeLocal !== 'string' || !localPattern.test(item.eventTimeLocal) ||
      typeof item.eventTimezone !== 'string' || !item.eventTimezone.trim() ||
      (item.verificationMethod !== null && typeof item.verificationMethod !== 'string') ||
      typeof item.finalizationVersion !== 'string'
    ) {
      throw new BiometricIntegrationError('بيانات حدث البصمة غير صالحة', 'BAD_RESPONSE');
    }

    const eventTime = new Date(item.eventTimeUtc);
    if (Number.isNaN(eventTime.getTime())) {
      throw new BiometricIntegrationError('وقت حدث البصمة غير صالح', 'BAD_RESPONSE');
    }

    return {
      eventId: item.eventId,
      personCode: item.personCode,
      eventType: item.eventType,
      eventTimeUtc: item.eventTimeUtc,
      eventTimeLocal: item.eventTimeLocal,
      eventTimezone: item.eventTimezone,
      verificationMethod: item.verificationMethod,
      finalizationVersion: item.finalizationVersion,
    };
  });

  const page = value.page;
  const afterId = assertCursor(page.afterId, 'afterId');
  const nextAfterId = assertCursor(page.nextAfterId, 'nextAfterId');
  if (
    typeof page.limit !== 'number' || !Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 500 ||
    typeof page.hasMore !== 'boolean'
  ) {
    throw new BiometricIntegrationError('بيانات صفحة أحداث البصمة غير صالحة', 'BAD_RESPONSE');
  }

  return {
    apiVersion: 'v1',
    items,
    page: { afterId, nextAfterId, limit: page.limit, hasMore: page.hasMore },
  };
}

export async function fetchBiometricFinalEventsPage(input?: {
  afterId?: string;
  limit?: number;
}): Promise<BiometricFinalEventsResponse> {
  const { baseUrl, token } = getBiometricApiConfig();
  const url = new URL(`${baseUrl}/final-events`);
  const afterId = String(input?.afterId ?? '0').trim();
  if (!/^\d+$/.test(afterId)) {
    throw new BiometricIntegrationError('مؤشر قراءة أحداث البصمة غير صالح', 'BAD_RESPONSE');
  }
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  url.searchParams.set('after_id', afterId);
  url.searchParams.set('limit', String(limit));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new BiometricIntegrationError('تعذر المصادقة مع نظام البصمة', 'AUTH_FAILED', response.status);
    }
    if (!response.ok) {
      throw new BiometricIntegrationError('نظام البصمة غير متاح حاليًا', 'UNAVAILABLE', response.status);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new BiometricIntegrationError('استجابة نظام البصمة غير صالحة', 'BAD_RESPONSE');
    }
    return assertSafeFinalEventsResponse(json);
  } catch (error: any) {
    if (error instanceof BiometricIntegrationError) throw error;
    if (error?.name === 'AbortError') {
      throw new BiometricIntegrationError('انتهت مهلة الاتصال بنظام البصمة', 'UNAVAILABLE');
    }
    throw new BiometricIntegrationError('تعذر الاتصال بنظام البصمة', 'UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

