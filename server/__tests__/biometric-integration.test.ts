import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BiometricIntegrationError,
  fetchBiometricFinalEventsPage,
  getBiometricPersonByCode,
  searchBiometricDirectory,
} from '../biometric-integration';

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.BIOMETRIC_SERVICE_API_URL;
const originalApiToken = process.env.BIOMETRIC_SERVICE_API_TOKEN;
const originalFinalEventsToken = process.env.BIOMETRIC_FINAL_EVENTS_API_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.BIOMETRIC_SERVICE_API_URL;
  else process.env.BIOMETRIC_SERVICE_API_URL = originalApiUrl;
  if (originalApiToken === undefined) delete process.env.BIOMETRIC_SERVICE_API_TOKEN;
  else process.env.BIOMETRIC_SERVICE_API_TOKEN = originalApiToken;
  if (originalFinalEventsToken === undefined) delete process.env.BIOMETRIC_FINAL_EVENTS_API_TOKEN;
  else process.env.BIOMETRIC_FINAL_EVENTS_API_TOKEN = originalFinalEventsToken;
  vi.restoreAllMocks();
});

describe('biometric integration client', () => {
  it('fails closed when no API token is configured', async () => {
    delete process.env.BIOMETRIC_SERVICE_API_TOKEN;
    delete process.env.BIOMETRIC_FINAL_EVENTS_API_TOKEN;

    await expect(searchBiometricDirectory()).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });

  it('uses bearer auth and returns only the safe directory contract', async () => {
    process.env.BIOMETRIC_SERVICE_API_URL = 'http://127.0.0.1:9097/api/v1';
    process.env.BIOMETRIC_SERVICE_API_TOKEN = 'secret-for-test-only';

    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toContain('/api/v1/person-directory');
      expect(String(url)).toContain('search=900003');
      expect(String(url)).toContain('limit=25');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-for-test-only');

      return new Response(JSON.stringify({
        apiVersion: 'v1',
        items: [{ personCode: '900003', displayName: 'Test Person 900003', status: 'active' }],
        page: { afterCode: '', nextAfterCode: '900003', limit: 25, hasMore: false },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as any;

    const result = await searchBiometricDirectory({ search: '900003', limit: 25 });
    expect(result.items).toEqual([
      { personCode: '900003', displayName: 'Test Person 900003', status: 'active' },
    ]);
  });

  it('requires an exact person code for the link lookup', async () => {
    process.env.BIOMETRIC_SERVICE_API_TOKEN = 'secret-for-test-only';
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      apiVersion: 'v1',
      items: [
        { personCode: '9000031', displayName: 'Near match', status: 'active' },
        { personCode: '900003', displayName: 'Exact match', status: 'active' },
      ],
      page: { afterCode: '', nextAfterCode: '9000031', limit: 50, hasMore: false },
    }), { status: 200 })) as any;

    await expect(getBiometricPersonByCode('900003')).resolves.toEqual({
      personCode: '900003',
      displayName: 'Exact match',
      status: 'active',
    });
  });

  it('reads the safe Final Events v1 contract with cursor pagination', async () => {
    process.env.BIOMETRIC_SERVICE_API_URL = 'http://127.0.0.1:9097/api/v1';
    process.env.BIOMETRIC_SERVICE_API_TOKEN = 'secret-for-test-only';

    globalThis.fetch = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toContain('/api/v1/final-events');
      expect(String(url)).toContain('after_id=42');
      expect(String(url)).toContain('limit=100');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-for-test-only');
      return new Response(JSON.stringify({
        apiVersion: 'v1',
        items: [{
          eventId: 'af4f1287-cf08-4695-be49-da46f59df72f',
          personCode: '900003',
          eventType: 'check_out',
          eventTimeUtc: '2026-09-02T13:28:07Z',
          eventTimeLocal: '2026-09-02T16:28:07',
          eventTimezone: 'Asia/Riyadh',
          verificationMethod: 'face',
          finalizationVersion: 'v1',
        }],
        page: { afterId: '42', nextAfterId: '43', limit: 100, hasMore: false },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;

    const result = await fetchBiometricFinalEventsPage({ afterId: '42', limit: 100 });
    expect(result.items[0]).toMatchObject({
      eventId: 'af4f1287-cf08-4695-be49-da46f59df72f',
      personCode: '900003',
      eventType: 'check_out',
      eventTimeUtc: '2026-09-02T13:28:07Z',
    });
    expect(result.page.nextAfterId).toBe('43');
  });

  it('does not expose upstream authentication details', async () => {
    process.env.BIOMETRIC_SERVICE_API_TOKEN = 'wrong-token';
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 })) as any;

    try {
      await searchBiometricDirectory();
      throw new Error('expected request to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BiometricIntegrationError);
      expect((error as BiometricIntegrationError).code).toBe('AUTH_FAILED');
      expect((error as Error).message).not.toContain('wrong-token');
    }
  });
});
