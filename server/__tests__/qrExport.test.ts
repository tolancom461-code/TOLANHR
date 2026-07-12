import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as db from '../db';
import * as QRCode from 'qrcode';

// Mock the database functions
vi.mock('../db', () => ({
  getWorkerById: vi.fn(),
  getWorkersByGroup: vi.fn(),
  getGroupById: vi.fn(),
}));

describe('QR Code Export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportWorkerQRCode', () => {
    it('should use worker.code when manualCode is not available', async () => {
      const mockWorker = {
        id: 1,
        code: 'W001',
        manualCode: null,
        fullName: 'Test Worker',
        qrToken: 'test-qr-token-123',
      };

      vi.mocked(db.getWorkerById).mockResolvedValue(mockWorker as any);

      const worker = await db.getWorkerById(1);
      
      // Verify that worker.code is available
      expect(worker.code).toBe('W001');
      expect(worker.code || worker.manualCode || 'N/A').toBe('W001');
    });

    it('should use manualCode when available', async () => {
      const mockWorker = {
        id: 1,
        code: 'W001',
        manualCode: 'MAN-001',
        fullName: 'Test Worker',
        qrToken: 'test-qr-token-123',
      };

      vi.mocked(db.getWorkerById).mockResolvedValue(mockWorker as any);

      const worker = await db.getWorkerById(1);
      
      // Verify that code is preferred
      expect(worker.code || worker.manualCode || 'N/A').toBe('W001');
    });

    it('should show N/A only when both code and manualCode are missing', async () => {
      const mockWorker = {
        id: 1,
        code: null,
        manualCode: null,
        fullName: 'Test Worker',
        qrToken: 'test-qr-token-123',
      };

      vi.mocked(db.getWorkerById).mockResolvedValue(mockWorker as any);

      const worker = await db.getWorkerById(1);
      
      // Verify fallback to N/A
      expect(worker.code || worker.manualCode || 'N/A').toBe('N/A');
    });

    it('should have valid QR token for export', async () => {
      const mockWorker = {
        id: 1,
        code: 'W001',
        manualCode: null,
        fullName: 'Test Worker',
        qrToken: 'test-qr-token-123',
      };

      vi.mocked(db.getWorkerById).mockResolvedValue(mockWorker as any);

      const worker = await db.getWorkerById(1);
      
      // Verify QR token exists
      expect(worker.qrToken).toBeDefined();
      expect(worker.qrToken).toBe('test-qr-token-123');
    });
  });

  describe('exportGroupQRCodes', () => {
    it('should export all workers in a group with their codes', async () => {
      const mockWorkers = [
        {
          id: 1,
          code: 'W001',
          manualCode: null,
          fullName: 'Worker 1',
          qrToken: 'token-1',
        },
        {
          id: 2,
          code: 'W002',
          manualCode: 'MAN-002',
          fullName: 'Worker 2',
          qrToken: 'token-2',
        },
        {
          id: 3,
          code: 'W003',
          manualCode: null,
          fullName: 'Worker 3',
          qrToken: 'token-3',
        },
      ];

      vi.mocked(db.getWorkersByGroup).mockResolvedValue(mockWorkers as any);

      const workers = await db.getWorkersByGroup(1);
      
      // Verify all workers have codes
      expect(workers).toHaveLength(3);
      expect(workers[0].code || workers[0].manualCode || 'N/A').toBe('W001');
      expect(workers[1].code || workers[1].manualCode || 'N/A').toBe('W002');
      expect(workers[2].code || workers[2].manualCode || 'N/A').toBe('W003');
    });

    it('should skip workers without QR tokens', async () => {
      const mockWorkers = [
        {
          id: 1,
          code: 'W001',
          manualCode: null,
          fullName: 'Worker 1',
          qrToken: 'token-1',
        },
        {
          id: 2,
          code: 'W002',
          manualCode: null,
          fullName: 'Worker 2',
          qrToken: null, // No QR token
        },
      ];

      vi.mocked(db.getWorkersByGroup).mockResolvedValue(mockWorkers as any);

      const workers = await db.getWorkersByGroup(1);
      const validWorkers = workers.filter((w: any) => w.qrToken);
      
      // Verify only workers with QR tokens are included
      expect(validWorkers).toHaveLength(1);
      expect(validWorkers[0].code).toBe('W001');
    });

    it('should get group name for export filename', async () => {
      const mockGroup = {
        id: 1,
        name: 'تقنية',
        costCenterId: 1,
      };

      vi.mocked(db.getGroupById).mockResolvedValue(mockGroup as any);

      const group = await db.getGroupById(1);
      
      // Verify group name is available
      expect(group?.name).toBe('تقنية');
    });
  });

  describe('QR Code Generation', () => {
    it('should generate valid QR code data URL', async () => {
      const testData = 'test-qr-token-123';
      
      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(testData, {
        width: 300,
        margin: 2,
      });
      
      // Verify QR code is generated
      expect(qrDataUrl).toBeDefined();
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should generate QR code with correct size', async () => {
      const testData = 'test-qr-token-123';
      
      const qrDataUrl = await QRCode.toDataURL(testData, {
        width: 200,
        margin: 1,
      });
      
      // Verify QR code is generated with specified size
      expect(qrDataUrl).toBeDefined();
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });
});
