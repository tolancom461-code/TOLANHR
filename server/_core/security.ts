import crypto from 'crypto';

/**
 * تحسينات الأمان
 * Security Enhancements
 */

/**
 * CSRF Protection using Signed Double Submit Cookie pattern
 * 
 * How it works:
 * 1. Server generates a random token and signs it with HMAC-SHA256 using JWT_SECRET
 * 2. Token is sent as a cookie (csrf_token) AND returned in the response body
 * 3. Frontend stores the token and sends it in X-CSRF-Token header with every mutation
 * 4. Server validates: cookie token matches header token, and signature is valid
 * 
 * Why this is secure:
 * - Attacker's site can trigger requests that include cookies (CSRF attack)
 * - But attacker CANNOT read the cookie value (due to sameSite + httpOnly=false for CSRF cookie)
 * - So attacker cannot set the X-CSRF-Token header correctly
 * - The signed token prevents attacker from forging their own tokens
 */
export class CSRFTokenManager {
  private readonly TOKEN_COOKIE = 'csrf_token';
  private readonly TOKEN_HEADER = 'x-csrf-token';
  private readonly TTL = 3600000; // 1 hour
  
  /**
   * Generate a signed CSRF token
   */
  generateToken(): { token: string; signature: string; combined: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now().toString(36);
    const payload = `${token}.${timestamp}`;
    const secret = process.env.JWT_SECRET || '';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const combined = `${payload}.${signature}`;
    return { token, signature, combined };
  }
  
  /**
   * Validate a CSRF token
   * Checks: format, signature, expiry, and cookie-header match
   */
  validateToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
    // Both must be present
    if (!cookieToken || !headerToken) {
      return false;
    }
    
    // Must match (constant-time comparison)
    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);
    if (cookieBuf.length !== headerBuf.length) {
      return false;
    }
    if (!crypto.timingSafeEqual(cookieBuf, headerBuf)) {
      return false;
    }
    
    // Parse the token: token.timestamp.signature
    const parts = cookieToken.split('.');
    if (parts.length !== 3) {
      return false;
    }
    
    const [tokenPart, timestampPart, signaturePart] = parts;
    
    // Verify signature
    const payload = `${tokenPart}.${timestampPart}`;
    const secret = process.env.JWT_SECRET || '';
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    const sigBuf = Buffer.from(signaturePart);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length) {
      return false;
    }
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return false;
    }
    
    // Check expiry
    const timestamp = parseInt(timestampPart, 36);
    if (isNaN(timestamp) || Date.now() - timestamp > this.TTL) {
      return false;
    }
    
    return true;
  }
  
  get cookieName() { return this.TOKEN_COOKIE; }
  get headerName() { return this.TOKEN_HEADER; }
}

export const csrfManager = new CSRFTokenManager();

/**
 * Rate Limiting
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export class RateLimiter {
  private requests = new Map<string, number[]>();
  private readonly config: RateLimitConfig;
  
  constructor(config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }) {
    this.config = config;
  }
  
  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Get requests for this key
    let requests = this.requests.get(key) || [];
    
    // Filter out old requests
    requests = requests.filter(time => time > windowStart);
    
    // Check if limit exceeded
    if (requests.length >= this.config.maxRequests) {
      return false;
    }
    
    // Add current request
    requests.push(now);
    this.requests.set(key, requests);
    
    return true;
  }
  
  getRemainingRequests(key: string): number {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const requests = (this.requests.get(key) || []).filter(
      time => time > windowStart
    );
    
    return Math.max(0, this.config.maxRequests - requests.length);
  }
  
  reset(key: string): void {
    this.requests.delete(key);
  }
}

// Global rate limiters
export const apiRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 500,
});

export const loginRateLimiter = new RateLimiter({
  windowMs: 900000, // 15 minutes
  maxRequests: 5,
});

export const payrollRateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10,
});

/**
 * Input Sanitization
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/['"]/g, '') // Remove quotes
    .trim();
}

export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = { ...obj };
  
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    }
  }
  
  return sanitized as T;
}

/**
 * Password hashing
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}

/**
 * Encryption/Decryption
 */
export class Encryptor {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  
  constructor(keyHex: string) {
    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('Key must be 32 bytes (256 bits)');
    }
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[0-9]{7,15}$/;
  return phoneRegex.test(phone);
}

/**
 * Content Security Policy headers
 */
export const CSPHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.manus.im https://*.manus.computer https://api.manus.im",
    "frame-ancestors 'self' https://*.manus.im https://*.manus.computer",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

/**
 * Security headers middleware
 */
export function getSecurityHeaders() {
  return {
    ...CSPHeaders,
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(self)',
  };
}
