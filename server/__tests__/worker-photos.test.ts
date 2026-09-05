import { describe, expect, it } from 'vitest';
import { canManageWorkerPhotos, WORKER_PHOTO_POLICY } from '@shared/workerPhotoPolicy';
import {
  buildWorkerPhotoAuditDetails,
  decodeWorkerPhotoBase64,
  getWebPDimensions,
  isWebPBuffer,
} from '../worker-photos';

function writeUInt24LE(buffer: Buffer, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}

function fakeWebP(width = 100, height = 100, size = 32): Buffer {
  const buffer = Buffer.alloc(Math.max(size, 32));
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  // byte 20 flags; bytes 21-23 reserved
  writeUInt24LE(buffer, 24, width - 1);
  writeUInt24LE(buffer, 27, height - 1);
  return buffer;
}

describe('worker photo policy', () => {
  it('allows only the approved worker-photo roles, plus the configured owner override', () => {
    expect(canManageWorkerPhotos('admin_affairs')).toBe(true);
    expect(canManageWorkerPhotos('data_entry')).toBe(true);
    expect(canManageWorkerPhotos('super_admin')).toBe(true);
    expect(canManageWorkerPhotos('accountant')).toBe(true);
    expect(canManageWorkerPhotos('accountant', true)).toBe(true);

    expect(canManageWorkerPhotos('auditor')).toBe(false);
    expect(canManageWorkerPhotos('executive')).toBe(false);
    expect(canManageWorkerPhotos(undefined)).toBe(false);
  });


  it('builds safe audit details for first upload without image payloads or URLs', () => {
    const audit = buildWorkerPhotoAuditDetails(false, 'workers/12/profile-test.webp');
    expect(audit.actionName).toBe('ADD_WORKER_PHOTO');
    expect(audit.beforeValues).toEqual({ photoPresent: false });
    expect(audit.afterValues).toEqual({ photoPresent: true, format: 'webp' });
    expect(audit.changedFields.workerPhoto).toEqual({ old: null, new: 'webp_uploaded' });

    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('base64');
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('http://');
    expect(serialized).not.toContain('https://');
  });

  it('records replacement as a distinct audit action', () => {
    const audit = buildWorkerPhotoAuditDetails(true, 'workers/12/profile-replacement.webp');
    expect(audit.actionName).toBe('REPLACE_WORKER_PHOTO');
    expect(audit.beforeValues).toEqual({ photoPresent: true });
    expect(audit.changedFields.workerPhoto).toEqual({ old: 'existing', new: 'webp_uploaded' });
  });

  it('accepts a WebP payload within the final size and dimension limits', () => {
    const source = fakeWebP(800, 800);
    const decoded = decodeWorkerPhotoBase64(source.toString('base64'));
    expect(decoded.equals(source)).toBe(true);
    expect(isWebPBuffer(decoded)).toBe(true);
    expect(getWebPDimensions(decoded)).toEqual({ width: 800, height: 800 });
  });

  it('rejects a non-WebP payload', () => {
    const source = Buffer.from('not-a-webp-image');
    expect(() => decodeWorkerPhotoBase64(source.toString('base64'))).toThrow(/WebP/);
  });

  it('rejects a final image above 1300 KB', () => {
    const source = fakeWebP(100, 100, WORKER_PHOTO_POLICY.hardMaxBytes + 1);
    expect(() => decodeWorkerPhotoBase64(source.toString('base64'))).toThrow(/يتجاوز/);
  });

  it('rejects final dimensions above 800x800 even if the payload is small', () => {
    const source = fakeWebP(801, 800);
    expect(() => decodeWorkerPhotoBase64(source.toString('base64'))).toThrow(/أبعاد/);
  });

  it('rejects malformed base64', () => {
    expect(() => decodeWorkerPhotoBase64('###not-base64###')).toThrow(/غير صالحة/);
  });
});
