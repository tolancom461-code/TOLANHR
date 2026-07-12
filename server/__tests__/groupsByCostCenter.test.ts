import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';

describe('Groups by Cost Center', () => {
  describe('getGroupsByCostCenter', () => {
    it('should return groups for a specific cost center', async () => {
      // Test with cost center ID 1 (تولان)
      const groups = await db.getGroupsByCostCenter(1);
      
      // Should return an array
      expect(Array.isArray(groups)).toBe(true);
      
      // All groups should have the correct cost center ID
      groups.forEach((group: any) => {
        expect(group.costCenterId).toBe(1);
      });
    });

    it('should return groups for different cost center', async () => {
      // Test with cost center ID 2 (الملقا)
      const groups = await db.getGroupsByCostCenter(2);
      
      // Should return an array
      expect(Array.isArray(groups)).toBe(true);
      
      // All groups should have the correct cost center ID
      groups.forEach((group: any) => {
        expect(group.costCenterId).toBe(2);
      });
    });

    it('should return empty array for non-existent cost center', async () => {
      // Test with non-existent cost center ID
      const groups = await db.getGroupsByCostCenter(9999);
      
      // Should return empty array
      expect(groups.length).toBe(0);
    });

    it('should return groups in correct order (most recent first)', async () => {
      const groups = await db.getGroupsByCostCenter(1);
      
      if (groups.length > 1) {
        // Check that groups are ordered by creation date (descending)
        for (let i = 0; i < groups.length - 1; i++) {
          const current = new Date(groups[i].createdAt).getTime();
          const next = new Date(groups[i + 1].createdAt).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it('should include all group properties', async () => {
      const groups = await db.getGroupsByCostCenter(1);
      
      if (groups.length > 0) {
        const group = groups[0];
        
        // Check required properties
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('code');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('costCenterId');
        expect(group).toHaveProperty('createdAt');
      }
    });
  });

  describe('API Integration', () => {
    it('should filter groups correctly when cost center changes', async () => {
      // Get groups for cost center 1
      const groupsCc1 = await db.getGroupsByCostCenter(1);
      
      // Get groups for cost center 2
      const groupsCc2 = await db.getGroupsByCostCenter(2);
      
      // Both should return arrays
      expect(Array.isArray(groupsCc1)).toBe(true);
      expect(Array.isArray(groupsCc2)).toBe(true);
      
      // They should have different groups (unless both are empty)
      if (groupsCc1.length > 0 && groupsCc2.length > 0) {
        // Check that groups are different
        const cc1Ids = groupsCc1.map((g: any) => g.id);
        const cc2Ids = groupsCc2.map((g: any) => g.id);
        
        // At least one group should be different
        const hasDifference = cc1Ids.some((id: number) => !cc2Ids.includes(id)) ||
                             cc2Ids.some((id: number) => !cc1Ids.includes(id));
        expect(hasDifference).toBe(true);
      }
    });
  });
});
