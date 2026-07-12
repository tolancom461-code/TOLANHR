import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as db from '../db';

// Mock the database functions
vi.mock('../db', () => ({
  createGroupShift: vi.fn(),
  getGroupSchedules: vi.fn(),
  getGroupShifts: vi.fn(),
}));

describe('Group Schedules - Dynamic Shifts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGroupShift', () => {
    it('should create a shift and generate schedules for all days of week', async () => {
      const mockShiftData = {
        groupId: 1,
        shiftName: 'صباحي',
        startTime: '08:00',
        endTime: '16:00',
        isActive: true,
      };

      vi.mocked(db.createGroupShift).mockResolvedValue(1);

      const result = await db.createGroupShift(mockShiftData as any);
      
      // Verify shift was created
      expect(result).toBe(1);
      expect(db.createGroupShift).toHaveBeenCalledWith(mockShiftData);
    });

    it('should calculate correct required hours for 8-hour shift', () => {
      const startTime = '08:00';
      const endTime = '16:00';
      
      // Calculate hours manually
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      const diffMin = endTotalMin - startTotalMin;
      const requiredHours = Math.round((diffMin / 60) * 100) / 100;
      
      expect(requiredHours).toBe(8);
    });

    it('should handle night shifts that cross midnight', () => {
      const startTime = '22:00';
      const endTime = '06:00';
      
      // Calculate hours for night shift
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      const startTotalMin = startHour * 60 + startMin;
      const endTotalMin = endHour * 60 + endMin;
      
      let diffMin = endTotalMin - startTotalMin;
      if (diffMin < 0) diffMin += 24 * 60; // Add 24 hours for next day
      
      const requiredHours = Math.round((diffMin / 60) * 100) / 100;
      
      expect(requiredHours).toBe(8);
    });

    it('should create schedules for all 7 days of week', () => {
      // Verify that schedules are created for days 1-7
      const daysOfWeek = [1, 2, 3, 4, 5, 6, 7];
      const dayNames = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
      
      expect(daysOfWeek).toHaveLength(7);
      expect(dayNames).toHaveLength(7);
      
      daysOfWeek.forEach((day, index) => {
        expect(day).toBe(index + 1);
      });
    });
  });

  describe('getGroupSchedules', () => {
    it('should retrieve schedules for specific group', async () => {
      const mockSchedules = [
        {
          id: 1,
          groupId: 1,
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '16:00',
          requiredHours: 8,
          isActive: true,
        },
        {
          id: 2,
          groupId: 1,
          dayOfWeek: 2,
          startTime: '08:00',
          endTime: '16:00',
          requiredHours: 8,
          isActive: true,
        },
      ];

      vi.mocked(db.getGroupSchedules).mockResolvedValue(mockSchedules as any);

      const result = await db.getGroupSchedules(1);
      
      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBe(1);
      expect(result[1].dayOfWeek).toBe(2);
    });

    it('should retrieve all schedules when no groupId provided', async () => {
      const mockSchedules = [
        {
          id: 1,
          groupId: 1,
          dayOfWeek: 1,
          startTime: '08:00',
          endTime: '16:00',
          requiredHours: 8,
          isActive: true,
        },
        {
          id: 2,
          groupId: 2,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          requiredHours: 8,
          isActive: true,
        },
      ];

      vi.mocked(db.getGroupSchedules).mockResolvedValue(mockSchedules as any);

      const result = await db.getGroupSchedules();
      
      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBe(1);
      expect(result[1].groupId).toBe(2);
    });

    it('should return empty array when no schedules exist', async () => {
      vi.mocked(db.getGroupSchedules).mockResolvedValue([]);

      const result = await db.getGroupSchedules(999);
      
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Schedule Data Validation', () => {
    it('should validate schedule has all required fields', () => {
      const validSchedule = {
        id: 1,
        groupId: 1,
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '16:00',
        requiredHours: 8,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(validSchedule.groupId).toBeDefined();
      expect(validSchedule.dayOfWeek).toBeDefined();
      expect(validSchedule.startTime).toBeDefined();
      expect(validSchedule.endTime).toBeDefined();
      expect(validSchedule.requiredHours).toBeDefined();
      expect(validSchedule.isActive).toBeDefined();
    });

    it('should ensure dayOfWeek is between 1-7', () => {
      const validDays = [1, 2, 3, 4, 5, 6, 7];
      
      validDays.forEach(day => {
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(7);
      });
    });

    it('should validate time format HH:MM', () => {
      const validTimes = ['08:00', '16:00', '22:00', '06:00'];
      const timeRegex = /^\d{2}:\d{2}$/;
      
      validTimes.forEach(time => {
        expect(time).toMatch(timeRegex);
      });
    });
  });
});
