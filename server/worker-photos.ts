import { randomUUID } from 'node:crypto';
import { WORKER_PHOTO_POLICY } from '@shared/workerPhotoPolicy';

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

type WebPDimensions = { width: number; height: number };

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

export function isWebPBuffer(buffer: Buffer): boolean {
  if (
    buffer.length < 16 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) {
    return false;
  }

  const chunkType = buffer.subarray(12, 16).toString('ascii');
  return chunkType === 'VP8 ' || chunkType === 'VP8L' || chunkType === 'VP8X';
}

/**
 * Read the canvas dimensions from the first WebP image header. Browser-created
 * WebP output is either VP8, VP8L or VP8X, and extended WebP requires VP8X as
 * the first chunk. This lets the server enforce the approved 800x800 policy
 * even if a caller bypasses the browser UI.
 */
export function getWebPDimensions(buffer: Buffer): WebPDimensions | null {
  if (!isWebPBuffer(buffer)) return null;

  const chunkType = buffer.subarray(12, 16).toString('ascii');

  if (chunkType === 'VP8X') {
    if (buffer.length < 30) return null;
    const width = readUInt24LE(buffer, 24) + 1;
    const height = readUInt24LE(buffer, 27) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunkType === 'VP8L') {
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    const width = 1 + ((b1 | (b2 << 8)) & 0x3fff);
    const height = 1 + (((b2 >> 6) | (b3 << 2) | (b4 << 10)) & 0x3fff);
    return { width, height };
  }

  if (chunkType === 'VP8 ') {
    if (
      buffer.length < 30 ||
      buffer[23] !== 0x9d ||
      buffer[24] !== 0x01 ||
      buffer[25] !== 0x2a
    ) {
      return null;
    }
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}

/**
 * Validate the already-processed image payload received from the browser.
 * The server never accepts an original 15 MB source image; only the final
 * WebP is sent over the API.
 */
export function decodeWorkerPhotoBase64(imageBase64: string): Buffer {
  const normalized = imageBase64.trim();
  const maxEncodedLength = Math.ceil(WORKER_PHOTO_POLICY.hardMaxBytes / 3) * 4 + 4;

  if (!normalized || normalized.length > maxEncodedLength) {
    throw new Error('حجم صورة العامل بعد المعالجة يتجاوز الحد المسموح');
  }

  if (normalized.length % 4 !== 0 || !BASE64_PATTERN.test(normalized)) {
    throw new Error('بيانات صورة العامل غير صالحة');
  }

  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length || buffer.length > WORKER_PHOTO_POLICY.hardMaxBytes) {
    throw new Error('حجم صورة العامل بعد المعالجة يتجاوز الحد المسموح');
  }

  if (!isWebPBuffer(buffer)) {
    throw new Error('صيغة صورة العامل النهائية يجب أن تكون WebP');
  }

  const dimensions = getWebPDimensions(buffer);
  if (!dimensions) {
    throw new Error('ملف WebP الخاص بصورة العامل غير صالح');
  }

  if (
    dimensions.width > WORKER_PHOTO_POLICY.maxWidth ||
    dimensions.height > WORKER_PHOTO_POLICY.maxHeight
  ) {
    throw new Error(
      `أبعاد صورة العامل النهائية يجب ألا تتجاوز ${WORKER_PHOTO_POLICY.maxWidth}×${WORKER_PHOTO_POLICY.maxHeight}`
    );
  }

  return buffer;
}

export function buildWorkerPhotoStorageKey(workerId: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `workers/${workerId}/profile-${timestamp}-${randomUUID()}.webp`;
}
