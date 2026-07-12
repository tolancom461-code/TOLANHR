/**
 * تحسينات الأداء
 * Performance Optimizations
 */

// Cache configuration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  
  set(key: string, value: T, ttl: number = 60000): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl,
    });
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
}

// Global cache instances
export const userCache = new SimpleCache();
export const workerCache = new SimpleCache();
export const groupCache = new SimpleCache();
export const settingsCache = new SimpleCache();

/**
 * Cache invalidation helper
 */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    userCache.clear();
    workerCache.clear();
    groupCache.clear();
    settingsCache.clear();
    return;
  }
  
  // Pattern-based invalidation
  if (pattern.includes('user')) userCache.clear();
  if (pattern.includes('worker')) workerCache.clear();
  if (pattern.includes('group')) groupCache.clear();
  if (pattern.includes('settings')) settingsCache.clear();
}

/**
 * Memoization decorator for async functions
 */
export function memoize<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  ttl: number = 60000
) {
  const cache = new Map<string, CacheEntry<R>>();
  
  return async (...args: T): Promise<R> => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp <= cached.ttl) {
      return cached.data;
    }
    
    const result = await fn(...args);
    cache.set(key, { data: result, timestamp: Date.now(), ttl });
    return result;
  };
}

/**
 * Pagination helper
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  total?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function paginate<T>(
  items: T[],
  options: PaginationOptions
): PaginatedResult<T> {
  const page = Math.max(1, options.page);
  const limit = Math.min(100, Math.max(1, options.limit));
  const total = options.total || items.length;
  
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const data = items.slice(startIndex, endIndex);
  
  const pages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Batch processing helper
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Debounce helper
 */
export function debounce<T extends any[], R>(
  fn: (...args: T) => Promise<R> | R,
  delay: number
) {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: T) => {
    return new Promise<R>((resolve, reject) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
}

/**
 * Retry helper
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private metrics = new Map<string, number[]>();
  
  start(label: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (!this.metrics.has(label)) {
        this.metrics.set(label, []);
      }
      
      this.metrics.get(label)!.push(duration);
    };
  }
  
  getStats(label: string) {
    const durations = this.metrics.get(label) || [];
    
    if (durations.length === 0) {
      return null;
    }
    
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count: durations.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / durations.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
  
  getAllStats() {
    const stats: Record<string, any> = {};
    
    this.metrics.forEach((_, label) => {
      stats[label] = this.getStats(label);
    });
    
    return stats;
  }
  
  reset(): void {
    this.metrics.clear();
  }
}

export const monitor = new PerformanceMonitor();

// ============================================
// Periodic Memory Cleanup
// ============================================

/**
 * Clean up caches and performance metrics periodically to prevent memory leaks
 * Runs every 5 minutes
 */
function startPeriodicCleanup() {
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  setInterval(() => {
    try {
      // Clear all cache instances
      userCache.clear();
      workerCache.clear();
      groupCache.clear();
      settingsCache.clear();
      
      // Reset performance metrics
      monitor.reset();
      
      // Log memory usage after cleanup
      const mem = process.memoryUsage();
      console.log(`[Cleanup] Memory caches cleared. Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
    } catch (error) {
      console.error('[Cleanup] Error during periodic cleanup:', error);
    }
  }, CLEANUP_INTERVAL);
  
  console.log('[Cleanup] Periodic memory cleanup started (every 5 minutes)');
}

// Start cleanup when module is loaded
startPeriodicCleanup();
