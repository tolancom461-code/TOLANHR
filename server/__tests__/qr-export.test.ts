import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('QR Code & Excel Export', () => {
  it('should have Arabic font file', () => {
    const fontPath = path.resolve('/home/ubuntu/tolanworkforce/server/fonts/NotoSansArabic-Regular.ttf');
    const exists = fs.existsSync(fontPath);
    
    expect(exists).toBe(true);
  });
  
  it('should have readable Arabic font file', () => {
    const fontPath = path.resolve('/home/ubuntu/tolanworkforce/server/fonts/NotoSansArabic-Regular.ttf');
    const stats = fs.statSync(fontPath);
    
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });
  
  it('should have correct font file size (around 825KB)', () => {
    const fontPath = path.resolve('/home/ubuntu/tolanworkforce/server/fonts/NotoSansArabic-Regular.ttf');
    const stats = fs.statSync(fontPath);
    
    // Font should be around 825KB (844676 bytes)
    expect(stats.size).toBeGreaterThan(800000);
    expect(stats.size).toBeLessThan(900000);
  });
});
