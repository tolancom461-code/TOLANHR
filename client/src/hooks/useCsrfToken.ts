/**
 * CSRF Token Management
 * 
 * Fetches a CSRF token from the server on mount and refreshes it periodically.
 * The token is stored in memory and used by the tRPC client for all mutations.
 * 
 * Enhanced: More aggressive refresh schedule and on-demand refresh support.
 */

let csrfToken: string | null = null;
let fetchPromise: Promise<string> | null = null;
let lastFetchTime: number = 0;

/**
 * Fetch a fresh CSRF token from the server.
 * Deduplicates concurrent requests automatically.
 */
export async function fetchCsrfToken(): Promise<string> {
  // If already fetching, return the existing promise (dedup)
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const response = await fetch('/api/csrf-token', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`CSRF token fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      csrfToken = data.token;
      lastFetchTime = Date.now();
      console.log('[CSRF] Token refreshed successfully');
      return data.token as string;
    } catch (error) {
      console.error('[CSRF] Failed to fetch token:', error);
      throw error;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Get the current CSRF token synchronously.
 * Returns null if no token has been fetched yet.
 */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/**
 * Check if the current CSRF token might be stale (older than 20 minutes).
 * If stale, triggers a background refresh.
 */
export function ensureFreshToken(): void {
  const TOKEN_STALE_MS = 20 * 60 * 1000; // 20 minutes
  if (Date.now() - lastFetchTime > TOKEN_STALE_MS) {
    fetchCsrfToken().catch(() => {});
  }
}

/**
 * Initialize CSRF protection:
 * - Fetch initial token
 * - Set up periodic refresh every 25 minutes (token expires in 60 minutes)
 * - More aggressive than before (was 50 min) to prevent expiry during active use
 */
export function initCsrfProtection(): void {
  // Fetch initial token
  fetchCsrfToken().catch(() => {
    // Retry after 3 seconds if initial fetch fails
    setTimeout(() => fetchCsrfToken().catch(() => {
      // Second retry after 10 seconds
      setTimeout(() => fetchCsrfToken().catch(() => {}), 10000);
    }), 3000);
  });

  // Refresh token every 25 minutes (token TTL is 60 minutes)
  // This ensures the token is always fresh even during long sessions
  setInterval(() => {
    fetchCsrfToken().catch(() => {});
  }, 25 * 60 * 1000);
}
