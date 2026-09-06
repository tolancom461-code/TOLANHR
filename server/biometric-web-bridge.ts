import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import {
  importOneBiometricFinalEvent,
  type BiometricFinalEventImportOutcome,
} from './biometric-final-events-importer';
import type { BiometricFinalEvent } from './biometric-integration';

const MAX_BATCH_SIZE = 100;
const TOKEN_MIN_LENGTH = 32;

export type BiometricWebBridgeBatch = {
  apiVersion: 'v1';
  sourceCursor?: string;
  events: BiometricFinalEvent[];
};

function configuredToken(): string {
  return String(process.env.BIOMETRIC_WEB_BRIDGE_INGEST_TOKEN ?? '').trim();
}

function bridgeEnabled(): boolean {
  return configuredToken().length >= TOKEN_MIN_LENGTH;
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(req: Request): string {
  const header = String(req.headers.authorization ?? '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function validateEvent(value: any): BiometricFinalEvent {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
  const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/;

  if (
    !value ||
    typeof value.eventId !== 'string' || !uuidPattern.test(value.eventId) ||
    typeof value.personCode !== 'string' || !value.personCode.trim() || value.personCode.length > 100 ||
    typeof value.eventType !== 'string' || !value.eventType.trim() || value.eventType.length > 50 ||
    typeof value.eventTimeUtc !== 'string' || !utcPattern.test(value.eventTimeUtc) ||
    typeof value.eventTimeLocal !== 'string' || !localPattern.test(value.eventTimeLocal) ||
    typeof value.eventTimezone !== 'string' || !value.eventTimezone.trim() || value.eventTimezone.length > 100 ||
    (value.verificationMethod !== null && typeof value.verificationMethod !== 'string') ||
    typeof value.finalizationVersion !== 'string' || value.finalizationVersion.length > 100
  ) {
    throw new TypeError('Invalid biometric Final Event payload');
  }

  const eventTime = new Date(value.eventTimeUtc);
  if (Number.isNaN(eventTime.getTime())) throw new TypeError('Invalid biometric Final Event time');

  return {
    eventId: value.eventId,
    personCode: value.personCode.trim(),
    eventType: value.eventType.trim(),
    eventTimeUtc: value.eventTimeUtc,
    eventTimeLocal: value.eventTimeLocal,
    eventTimezone: value.eventTimezone.trim(),
    verificationMethod: value.verificationMethod == null ? null : String(value.verificationMethod),
    finalizationVersion: value.finalizationVersion,
  };
}

export function parseBiometricWebBridgeBatch(value: any): BiometricWebBridgeBatch {
  if (!value || value.apiVersion !== 'v1' || !Array.isArray(value.events)) {
    throw new TypeError('Invalid biometric bridge request');
  }
  if (value.events.length < 1 || value.events.length > MAX_BATCH_SIZE) {
    throw new TypeError(`events must contain between 1 and ${MAX_BATCH_SIZE} items`);
  }

  let sourceCursor: string | undefined;
  if (value.sourceCursor != null) {
    sourceCursor = String(value.sourceCursor).trim();
    if (!/^\d+$/.test(sourceCursor)) throw new TypeError('Invalid sourceCursor');
  }

  return {
    apiVersion: 'v1',
    sourceCursor,
    events: value.events.map(validateEvent),
  };
}

function publicOutcome(outcome: BiometricFinalEventImportOutcome) {
  return {
    eventId: outcome.eventId,
    status: outcome.status,
  };
}

export function registerBiometricWebBridgeRoutes(app: Express): void {
  if (!bridgeEnabled()) {
    console.log('[Biometric Web Bridge] ingest endpoint: disabled');
  } else {
    console.log('[Biometric Web Bridge] ingest endpoint: enabled');
  }

  app.get('/api/biometric-bridge/v1/health', (req: Request, res: Response) => {
    const token = configuredToken();
    if (token.length < TOKEN_MIN_LENGTH) return res.status(404).json({ error: 'NOT_FOUND' });
    const provided = bearerToken(req);
    if (!provided || !secureEqual(provided, token)) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, apiVersion: 'v1' });
  });

  app.post('/api/biometric-bridge/v1/final-events', async (req: Request, res: Response) => {
    const token = configuredToken();
    if (token.length < TOKEN_MIN_LENGTH) return res.status(404).json({ error: 'NOT_FOUND' });

    const provided = bearerToken(req);
    if (!provided || !secureEqual(provided, token)) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }

    let batch: BiometricWebBridgeBatch;
    try {
      batch = parseBiometricWebBridgeBatch(req.body);
    } catch (error: any) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: error?.message ?? 'Invalid request' });
    }

    try {
      const results = [];
      for (const event of batch.events) {
        const outcome = await importOneBiometricFinalEvent(event);
        results.push(publicOutcome(outcome));
      }

      const counts: Record<string, number> = {};
      for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
      console.log(`[Biometric Web Bridge] received ${results.length}; results=${JSON.stringify(counts)}`);

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        apiVersion: 'v1',
        sourceCursor: batch.sourceCursor ?? null,
        received: batch.events.length,
        results,
      });
    } catch (error) {
      console.error('[Biometric Web Bridge] ingest failed:', error);
      return res.status(500).json({ error: 'INGEST_FAILED' });
    }
  });
}
