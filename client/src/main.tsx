import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { getCsrfToken, fetchCsrfToken, initCsrfProtection } from "./hooks/useCsrfToken";
import "./index.css";

// Initialize CSRF protection (fetch token on load, refresh periodically)
initCsrfProtection();

// ==========================================
// Resilient fetch wrapper with retry, CSRF refresh, and error interception
// ==========================================
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enhanced fetch that handles non-tRPC responses (403 CSRF, 429 Rate Limit, 502/503 Server Down)
 * and retries failed requests automatically.
 */
async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Ensure CSRF token is fresh on every attempt
      const token = getCsrfToken();
      const headers = new Headers((init?.headers as HeadersInit) || {});
      if (token) {
        headers.set('x-csrf-token', token);
      }

      const response = await globalThis.fetch(input, {
        ...(init ?? {}),
        headers,
        credentials: "include",
      });

      // === Handle CSRF failure (403) ===
      if (response.status === 403) {
        // Clone response to read body without consuming it
        const cloned = response.clone();
        try {
          const body = await cloned.json();
          if (body.error === 'CSRF_VALIDATION_FAILED') {
            console.warn(`[Resilient Fetch] CSRF token expired (attempt ${attempt}/${MAX_RETRIES}). Refreshing...`);
            // Refresh CSRF token immediately
            await fetchCsrfToken();
            if (attempt < MAX_RETRIES) {
              await sleep(500); // Short delay before retry with new token
              continue; // Retry with fresh token
            }
            // Final attempt failed - throw readable error
            throw new Error('فشل التحقق من رمز الحماية. يرجى تحديث الصفحة.');
          }
        } catch (parseErr) {
          // If body isn't JSON, it's an HTML error page from proxy
          if (parseErr instanceof SyntaxError) {
            console.warn(`[Resilient Fetch] 403 with non-JSON response (attempt ${attempt}/${MAX_RETRIES})`);
            if (attempt < MAX_RETRIES) {
              await sleep(RETRY_DELAY_MS);
              continue;
            }
          }
          // Re-throw if it's our custom error
          if (parseErr instanceof Error && parseErr.message.includes('رمز الحماية')) {
            throw parseErr;
          }
        }
      }

      // === Handle Rate Limiting (429) ===
      if (response.status === 429) {
        console.warn(`[Resilient Fetch] Rate limited (attempt ${attempt}/${MAX_RETRIES}). Waiting...`);
        if (attempt < MAX_RETRIES) {
          // Wait longer for rate limit - exponential backoff
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error('تم تجاوز الحد الأقصى للطلبات. يرجى الانتظار قليلاً والمحاولة مرة أخرى.');
      }

      // === Handle Server Down (502, 503, 504) ===
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        console.warn(`[Resilient Fetch] Server unavailable ${response.status} (attempt ${attempt}/${MAX_RETRIES}). Retrying...`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error('الخادم غير متاح حالياً. يرجى المحاولة بعد لحظات.');
      }

      // === Handle other non-OK responses that might not be tRPC format ===
      if (!response.ok && response.status >= 500) {
        console.warn(`[Resilient Fetch] Server error ${response.status} (attempt ${attempt}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }

      // Success or tRPC-handled error - return response as-is
      return response;

    } catch (fetchError) {
      // Network errors (no internet, DNS failure, timeout)
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      
      // Don't retry our custom thrown errors
      if (lastError.message.includes('رمز الحماية') || 
          lastError.message.includes('الحد الأقصى') || 
          lastError.message.includes('غير متاح')) {
        throw lastError;
      }

      console.warn(`[Resilient Fetch] Network error (attempt ${attempt}/${MAX_RETRIES}):`, lastError.message);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('فشل الاتصال بالخادم بعد عدة محاولات.');
}

// ==========================================
// Query Client with error handling
// ==========================================
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      retry: false, // Mutations use resilientFetch retry instead
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// ==========================================
// tRPC Client with resilient fetch
// ==========================================
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const token = getCsrfToken();
        if (token) {
          return {
            'x-csrf-token': token,
          };
        }
        return {};
      },
      fetch: resilientFetch,
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
