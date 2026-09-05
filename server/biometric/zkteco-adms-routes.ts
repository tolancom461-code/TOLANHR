import type { Express, Request, RequestHandler, Response } from "express";
import express from "express";
import { getBiometricDeviceBySerial, touchBiometricDevice } from "../db/biometric";
import { buildZktecoInitializationResponse, processZktecoAttendanceUpload } from "./zkteco-adms-service";
import { RateLimiter } from "../_core/security";

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0];
  return req.ip || req.socket.remoteAddress || null;
}

function getSerial(req: Request): string {
  const raw = req.query.SN ?? req.query.sn ?? '';
  return String(raw).trim();
}


function safeAdmsHandler(
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(error => {
      console.error('[Biometric][ADMS] Request failed:', error);
      if (!res.headersSent) {
        res.status(500).type('text/plain').send('ERROR');
        return;
      }
      next(error);
    });
  };
}

/**
 * ZKTeco ADMS/PUSH routes must be registered before the application's generic
 * JSON/urlencoded parsers, because terminals post plain-text ATTLOG payloads.
 *
 * Only ATTLOG data is accepted. User/template payloads are deliberately not
 * ingested so fingerprint and face templates never enter this application DB.
 */
export function registerZktecoAdmsRoutes(app: Express) {
  const textBody = express.text({ type: '*/*', limit: '256kb' });
  // Separate allowance from the interactive API limiter. A terminal may poll
  // frequently, while 1,200 requests/minute/IP is still high enough for many
  // devices behind one NAT and low enough to damp obvious request floods.
  const admsRateLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 1_200 });
  app.use('/iclock', (req, res, next) => {
    // Do not use X-Forwarded-For as a security key here; it may be spoofable
    // unless Express trust-proxy is configured. Use the socket/Express IP for
    // the in-process limiter and keep forwarded IP only as audit metadata.
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    if (!admsRateLimiter.isAllowed(key)) {
      return res.status(429).type('text/plain').send('ERROR: rate limit');
    }
    next();
  });

  app.get('/iclock/cdata', safeAdmsHandler(async (req, res) => {
    const serialNumber = getSerial(req);
    if (!serialNumber) return res.status(400).type('text/plain').send('ERROR: missing SN');

    const device = await getBiometricDeviceBySerial(serialNumber);
    if (!device || !device.isActive) {
      // Never acknowledge an unregistered terminal as successfully connected.
      // The administrator must pre-register its Serial Number before ADMS is
      // configured; otherwise an OK could make some firmware consider logs sent.
      return res.status(403).type('text/plain').send('ERROR: unknown device');
    }

    await touchBiometricDevice(device.id, {
      ipAddress: getClientIp(req),
      firmwareVersion: req.query.FWVersion ? String(req.query.FWVersion) : null,
      platform: req.query.platform ? String(req.query.platform) : null,
    });

    return res.status(200).type('text/plain').send(buildZktecoInitializationResponse(serialNumber));
  }));

  app.post('/iclock/cdata', textBody, safeAdmsHandler(async (req, res) => {
    const serialNumber = getSerial(req);
    if (!serialNumber) return res.status(400).type('text/plain').send('ERROR: missing SN');

    const table = String(req.query.table ?? '').toUpperCase();
    const body = typeof req.body === 'string' ? req.body : '';

    // Never store biometric templates / enrollment payloads. The project only
    // needs attendance transactions.
    if (table !== 'ATTLOG') {
      const lineCount = body.split(/\r?\n/).filter(Boolean).length;
      return res.status(200).type('text/plain').send(`OK: ${lineCount}`);
    }

    const result = await processZktecoAttendanceUpload({
      serialNumber,
      body,
      sourceIp: getClientIp(req),
    });

    if (result.unknownDevice) {
      return res.status(403).type('text/plain').send('ERROR: unknown device');
    }

    return res.status(200).type('text/plain').send(`OK: ${result.received}`);
  }));

  app.get('/iclock/getrequest', safeAdmsHandler(async (req, res) => {
    const serialNumber = getSerial(req);
    const device = serialNumber ? await getBiometricDeviceBySerial(serialNumber) : null;
    if (device?.isActive) await touchBiometricDevice(device.id, { ipAddress: getClientIp(req) });
    return res.status(200).type('text/plain').send('OK');
  }));

  app.post('/iclock/devicecmd', textBody, safeAdmsHandler(async (req, res) => {
    const serialNumber = getSerial(req);
    const device = serialNumber ? await getBiometricDeviceBySerial(serialNumber) : null;
    if (device?.isActive) await touchBiometricDevice(device.id, { ipAddress: getClientIp(req) });
    return res.status(200).type('text/plain').send('OK');
  }));
}
