import "dotenv/config";
// Set timezone to Saudi Arabia (UTC+3)
process.env.TZ = 'Asia/Riyadh';

import express from "express";
import { sql } from "drizzle-orm";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getSecurityHeaders, apiRateLimiter, loginRateLimiter, csrfManager } from "./security";
import { parse as parseCookieHeader } from "cookie";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Log memory usage periodically to detect memory leaks early
 */
function startMemoryLogging() {
  const MEMORY_LOG_INTERVAL = 60 * 1000; // Every 1 minute
  
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(
      `[Memory] Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB | ` +
      `RSS: ${Math.round(mem.rss / 1024 / 1024)}MB | ` +
      `External: ${Math.round(mem.external / 1024 / 1024)}MB`
    );
  }, MEMORY_LOG_INTERVAL);
  
  console.log('[Memory] Periodic memory logging started (every 1 minute)');
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ==========================================
  // SECURITY MIDDLEWARE
  // ==========================================

  // 1. Security Headers (CSP, HSTS, X-Frame-Options, etc.)
  app.use((req, res, next) => {
    const headers = getSecurityHeaders();
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
    next();
  });

  // 2. Rate Limiting for API endpoints
  app.use("/api/trpc", (req, res, next) => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Stricter rate limit for auth-related endpoints
    const isAuthEndpoint = req.url?.includes('auth.localLogin') || req.url?.includes('auth.logout');
    const limiter = isAuthEndpoint ? loginRateLimiter : apiRateLimiter;
    
    if (!limiter.isAllowed(clientIP)) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً.',
        retryAfter: isAuthEndpoint ? 900 : 60,
      });
      return;
    }
    next();
  });

  // 3. Body size limits - reduced from 50MB to 10MB (still allows Excel imports)
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ==========================================
  // CSRF TOKEN ENDPOINT
  // ==========================================
  app.get("/api/csrf-token", (req, res) => {
    const { combined } = csrfManager.generateToken();
    
    // Set CSRF cookie (NOT httpOnly - frontend needs to read it)
    // sameSite: "lax" prevents cross-origin sending
    const isSecure = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(csrfManager.cookieName, combined, {
      httpOnly: false, // Frontend must read this
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600000, // 1 hour
    });
    
    res.json({ token: combined });
  });

  // ==========================================
  // CSRF VALIDATION MIDDLEWARE (mutations only)
  // ==========================================
  app.use("/api/trpc", (req, res, next) => {
    // Only validate on POST requests (mutations)
    // GET requests (queries) don't need CSRF protection
    if (req.method !== 'POST') {
      return next();
    }
    
    // Skip CSRF check for auth endpoints (login/logout/callback)
    // These are either the first request or use different auth flow
    const url = req.url || '';
    if (url.includes('auth.localLogin') || url.includes('auth.logout') || url.includes('auth.me')) {
      return next();
    }
    
    // Get token from cookie and header
    const cookies = parseCookieHeader(req.headers.cookie || '');
    const cookieToken = cookies[csrfManager.cookieName];
    const headerToken = req.headers[csrfManager.headerName] as string | undefined;
    
    if (!csrfManager.validateToken(cookieToken, headerToken)) {
      res.status(403).json({
        error: 'CSRF_VALIDATION_FAILED',
        message: 'رمز الحماية غير صالح. يرجى تحديث الصفحة والمحاولة مرة أخرى.',
      });
      return;
    }
    
    next();
  });

  // ==========================================
  // HEALTH CHECK ENDPOINT
  // ==========================================
  app.get("/api/health", async (req, res) => {
    try {
      // Check database connection
      const { getDb } = await import('../db');
      const database = await getDb();
      if (database) {
        // Simple query to verify DB is responsive
        await database.execute(sql`SELECT 1`);
      }
      
      // Return health status with memory info
      const mem = process.memoryUsage();
      res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          rss: Math.round(mem.rss / 1024 / 1024),
        }
      });
    } catch (error) {
      console.error('[Health Check] Failed:', error);
      res.status(503).json({ 
        status: 'error', 
        message: 'Database unreachable',
        timestamp: new Date().toISOString()
      });
    }
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Auto-run migration for flexible schedule feature
    try {
      const { runMigration } = await import('../db');
      await runMigration();
      console.log('[Migration] Successfully added flexible schedule columns');
    } catch (error: any) {
      if (error.message?.includes('duplicate column name')) {
        console.log('[Migration] Columns already exist, skipping migration');
      } else {
        console.error('[Migration] Failed:', error.message);
      }
    }
    
    // Start periodic memory logging
    startMemoryLogging();
  });
  
  // ==========================================
  // GRACEFUL SHUTDOWN HANDLERS
  // ==========================================
  
  // Handle SIGTERM (sent by Railway before stopping the service)
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  });
  
  // Handle SIGINT (Ctrl+C in development)
  process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('[Server] HTTP server closed');
      process.exit(0);
    });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught Exception:', error);
    console.error('[Server] Stack:', error.stack);
    // Exit with error code to trigger Railway restart policy
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled Rejection at:', promise);
    console.error('[Server] Reason:', reason);
    // Exit with error code to trigger Railway restart policy
    process.exit(1);
  });
}

startServer().catch(console.error);
