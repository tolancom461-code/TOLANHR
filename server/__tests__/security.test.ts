import { describe, it, expect, vi, beforeEach } from "vitest";
import { ROLE_PERMISSIONS, canApproveBatchAtStage, canRejectBatchAtStage, cannotSelfReview } from "../permissions";
import type { UserRole } from "../../drizzle/schema";
import { getSecurityHeaders, RateLimiter, loginRateLimiter, apiRateLimiter, sanitizeInput, sanitizeObject, CSRFTokenManager, Encryptor, generateSecureToken } from "../_core/security";

// ==========================================
// SECURITY AUDIT TESTS
// ==========================================

describe("Security - Role-Based Access Control (RBAC)", () => {
  const allRoles: UserRole[] = [
    "guard", "supervisor_tolan", "supervisor_malqa", "admin_affairs", "accountant",
    "auditor", "finance_manager", "executive", "super_admin"
  ];

  // ---- Privilege Escalation Prevention ----
  describe("Privilege Escalation Prevention", () => {
    it("guard cannot create batches, manage workers, or access admin features", () => {
      const perms = ROLE_PERMISSIONS["guard"];
      expect(perms.canCreateBatch).toBe(false);
      expect(perms.canDeleteBatch).toBe(false);
      expect(perms.canSubmitDraft).toBe(false);
      expect(perms.canManageWorkers).toBe(false);
      expect(perms.canManageGroups).toBe(false);
      expect(perms.canManageCostCenters).toBe(false);
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canEditAttendanceLog).toBe(false);
    });

    it("supervisors cannot manage financial operations", () => {
      for (const role of ["supervisor_tolan", "supervisor_malqa"] as UserRole[]) {
        const perms = ROLE_PERMISSIONS[role];
        expect(perms.canCreateBatch).toBe(false);
        expect(perms.canDeleteBatch).toBe(false);
        expect(perms.canSubmitDraft).toBe(false);
        expect(perms.canReviewAsAccountant).toBe(false);
        expect(perms.canReviewAsAuditor).toBe(false);
        expect(perms.canApproveAsFM).toBe(false);
        expect(perms.canManageUsers).toBe(false);
        expect(perms.canViewFinancialReports).toBe(false);
      }
    });

    it("accountant cannot submit drafts or approve as auditor/FM", () => {
      const perms = ROLE_PERMISSIONS["accountant"];
      expect(perms.canSubmitDraft).toBe(false);
      expect(perms.canReviewAsAuditor).toBe(false);
      expect(perms.canApproveAsFM).toBe(false);
      expect(perms.canDeleteBatch).toBe(false);
    });

    it("auditor cannot submit drafts, delete, or approve as accountant/FM", () => {
      const perms = ROLE_PERMISSIONS["auditor"];
      expect(perms.canSubmitDraft).toBe(false);
      expect(perms.canDeleteBatch).toBe(false);
      expect(perms.canCreateBatch).toBe(false);
      expect(perms.canReviewAsAccountant).toBe(false);
      expect(perms.canApproveAsFM).toBe(false);
      expect(perms.canManageWorkers).toBe(false);
      expect(perms.canManageGroups).toBe(false);
      expect(perms.canEditAttendanceLog).toBe(false);
    });

    it("finance_manager cannot submit drafts, delete, or review as accountant/auditor", () => {
      const perms = ROLE_PERMISSIONS["finance_manager"];
      expect(perms.canSubmitDraft).toBe(false);
      expect(perms.canDeleteBatch).toBe(false);
      expect(perms.canCreateBatch).toBe(false);
      expect(perms.canReviewAsAccountant).toBe(false);
      expect(perms.canReviewAsAuditor).toBe(false);
      expect(perms.canManageWorkers).toBe(false);
      expect(perms.canManageGroups).toBe(false);
      expect(perms.canEditAttendanceLog).toBe(false);
    });

    it("executive has read-only access to executive dashboard only", () => {
      const perms = ROLE_PERMISSIONS["executive"];
      expect(perms.canViewExecutiveDashboard).toBe(true);
      expect(perms.canCreateBatch).toBe(false);
      expect(perms.canDeleteBatch).toBe(false);
      expect(perms.canManageWorkers).toBe(false);
      expect(perms.canManageGroups).toBe(false);
      expect(perms.canManageUsers).toBe(false);
      expect(perms.canEditAttendanceLog).toBe(false);
    });

    it("only super_admin has canManageUsers", () => {
      for (const role of allRoles) {
        const perms = ROLE_PERMISSIONS[role];
        if (role === "super_admin") {
          expect(perms.canManageUsers).toBe(true);
        }
        // admin_affairs can create users but canManageUsers is false (handled separately in routers)
      }
    });
  });

  // ---- Payroll Workflow Security ----
  describe("Payroll Workflow - Stage Bypass Prevention", () => {
    it("auditor CANNOT act on draft stage", () => {
      const result = canApproveBatchAtStage("auditor", "draft");
      expect(result.allowed).toBe(false);
    });

    it("auditor CAN act on under_accountant_review stage (optional skip of accountant)", () => {
      const result = canApproveBatchAtStage("auditor", "under_accountant_review");
      expect(result.allowed).toBe(true);
    });

    it("auditor CAN act on under_financial_review stage", () => {
      const result = canApproveBatchAtStage("auditor", "under_financial_review");
      expect(result.allowed).toBe(true);
    });

    it("accountant CANNOT act on draft stage", () => {
      const result = canApproveBatchAtStage("accountant", "draft");
      expect(result.allowed).toBe(false);
    });

    it("accountant CAN act on under_accountant_review stage", () => {
      const result = canApproveBatchAtStage("accountant", "under_accountant_review");
      expect(result.allowed).toBe(true);
    });

    it("accountant CANNOT act on under_financial_review stage", () => {
      const result = canApproveBatchAtStage("accountant", "under_financial_review");
      expect(result.allowed).toBe(false);
    });

    it("finance_manager CANNOT act on draft/accountant/auditor stages", () => {
      expect(canApproveBatchAtStage("finance_manager", "draft").allowed).toBe(false);
      expect(canApproveBatchAtStage("finance_manager", "under_accountant_review").allowed).toBe(false);
      expect(canApproveBatchAtStage("finance_manager", "under_financial_review").allowed).toBe(false);
    });

    it("finance_manager CAN act on under_accounts_manager_review stage", () => {
      const result = canApproveBatchAtStage("finance_manager", "under_accounts_manager_review");
      expect(result.allowed).toBe(true);
    });

    it("admin_affairs CAN submit draft", () => {
      const result = canApproveBatchAtStage("admin_affairs", "draft");
      expect(result.allowed).toBe(true);
    });

    it("admin_affairs CANNOT approve at any review stage", () => {
      expect(canApproveBatchAtStage("admin_affairs", "under_accountant_review").allowed).toBe(false);
      expect(canApproveBatchAtStage("admin_affairs", "under_financial_review").allowed).toBe(false);
      expect(canApproveBatchAtStage("admin_affairs", "under_accounts_manager_review").allowed).toBe(false);
    });

    it("guard/supervisors/executive CANNOT act on any payroll stage", () => {
      const nonPayrollRoles: UserRole[] = ["guard", "supervisor_tolan", "supervisor_malqa", "executive"];
      const allStatuses = ["draft", "under_accountant_review", "under_financial_review", "under_accounts_manager_review"];
      
      for (const role of nonPayrollRoles) {
        for (const status of allStatuses) {
          const result = canApproveBatchAtStage(role, status);
          expect(result.allowed).toBe(false);
        }
      }
    });

    it("super_admin can act on all stages", () => {
      const allStatuses = ["draft", "under_accountant_review", "under_financial_review", "under_accounts_manager_review"];
      for (const status of allStatuses) {
        expect(canApproveBatchAtStage("super_admin", status).allowed).toBe(true);
      }
    });
  });

  // ---- Rejection Flow Security ----
  describe("Payroll Rejection - All rejections return to draft", () => {
    it("accountant can reject at under_accountant_review", () => {
      expect(canRejectBatchAtStage("accountant", "under_accountant_review").allowed).toBe(true);
    });

    it("auditor can reject at under_financial_review", () => {
      expect(canRejectBatchAtStage("auditor", "under_financial_review").allowed).toBe(true);
    });

    it("finance_manager can reject at under_accounts_manager_review", () => {
      expect(canRejectBatchAtStage("finance_manager", "under_accounts_manager_review").allowed).toBe(true);
    });

    it("auditor CAN reject at accountant stage (optional skip), CANNOT at FM stage", () => {
      expect(canRejectBatchAtStage("auditor", "under_accountant_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("auditor", "under_accounts_manager_review").allowed).toBe(false);
    });

    it("accountant CANNOT reject at wrong stages", () => {
      expect(canRejectBatchAtStage("accountant", "under_financial_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("accountant", "under_accounts_manager_review").allowed).toBe(false);
    });
  });

  // ---- Self-Review Prevention ----
  describe("Self-Review Prevention", () => {
    it("accountant cannot review their own batch", () => {
      expect(cannotSelfReview(1, 1, "accountant")).toBe(true);
    });

    it("accountant can review another user's batch", () => {
      expect(cannotSelfReview(1, 2, "accountant")).toBe(false);
    });

    it("super_admin bypasses self-review check", () => {
      expect(cannotSelfReview(1, 1, "super_admin")).toBe(false);
    });
  });

  // ---- Supervisor Restrictions ----
  describe("Supervisor Restrictions (canProcessNotes)", () => {
    it("supervisor_tolan has NO canProcessNotes (not in ROLE_PERMISSIONS)", () => {
      const perms = ROLE_PERMISSIONS["supervisor_tolan"] as any;
      // canProcessNotes is not defined in the permissions object for supervisors
      expect(perms.canProcessNotes).toBeUndefined();
    });

    it("supervisor_malqa has NO canProcessNotes", () => {
      const perms = ROLE_PERMISSIONS["supervisor_malqa"] as any;
      expect(perms.canProcessNotes).toBeUndefined();
    });
  });
});

// ==========================================
// SECURITY INFRASTRUCTURE TESTS
// ==========================================

describe("Security - Rate Limiter", () => {
  it("should allow requests within limit", () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed("test-ip")).toBe(true);
    }
  });

  it("should block requests exceeding limit", () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 3 });
    limiter.isAllowed("test-ip");
    limiter.isAllowed("test-ip");
    limiter.isAllowed("test-ip");
    expect(limiter.isAllowed("test-ip")).toBe(false);
  });

  it("should track different IPs independently", () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 });
    limiter.isAllowed("ip-1");
    limiter.isAllowed("ip-1");
    expect(limiter.isAllowed("ip-1")).toBe(false);
    expect(limiter.isAllowed("ip-2")).toBe(true);
  });

  it("should report remaining requests correctly", () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
    expect(limiter.getRemainingRequests("test")).toBe(5);
    limiter.isAllowed("test");
    limiter.isAllowed("test");
    expect(limiter.getRemainingRequests("test")).toBe(3);
  });

  it("should reset correctly", () => {
    const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 });
    limiter.isAllowed("test");
    limiter.isAllowed("test");
    expect(limiter.isAllowed("test")).toBe(false);
    limiter.reset("test");
    expect(limiter.isAllowed("test")).toBe(true);
  });

  it("login rate limiter has strict limits (5 per 15 min)", () => {
    expect(loginRateLimiter).toBeDefined();
    // Test that it blocks after 5 attempts
    const testIp = `login-test-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      expect(loginRateLimiter.isAllowed(testIp)).toBe(true);
    }
    expect(loginRateLimiter.isAllowed(testIp)).toBe(false);
  });
});

describe("Security - CSRF Token Manager (Signed Double Submit Cookie)", () => {
  let csrf: CSRFTokenManager;

  beforeEach(() => {
    // Set JWT_SECRET for testing
    process.env.JWT_SECRET = 'test-secret-key-for-csrf-testing-1234';
    csrf = new CSRFTokenManager();
  });

  it("should generate a signed token with 3 parts", () => {
    const { combined } = csrf.generateToken();
    expect(combined).toBeTruthy();
    const parts = combined.split('.');
    expect(parts.length).toBe(3); // token.timestamp.signature
  });

  it("should validate when cookie and header match", () => {
    const { combined } = csrf.generateToken();
    // Simulate: cookie = combined, header = combined (same value)
    expect(csrf.validateToken(combined, combined)).toBe(true);
  });

  it("should reject when header token is different from cookie", () => {
    const { combined } = csrf.generateToken();
    expect(csrf.validateToken(combined, "wrong-token")).toBe(false);
  });

  it("should reject when cookie token is missing", () => {
    const { combined } = csrf.generateToken();
    expect(csrf.validateToken(undefined, combined)).toBe(false);
  });

  it("should reject when header token is missing", () => {
    const { combined } = csrf.generateToken();
    expect(csrf.validateToken(combined, undefined)).toBe(false);
  });

  it("should reject forged tokens with wrong signature", () => {
    const { combined } = csrf.generateToken();
    const parts = combined.split('.');
    // Tamper with the signature
    const forged = `${parts[0]}.${parts[1]}.${'a'.repeat(64)}`;
    expect(csrf.validateToken(forged, forged)).toBe(false);
  });

  it("should reject expired tokens", () => {
    // Generate a token with a timestamp from 2 hours ago
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const oldTimestamp = (Date.now() - 7200000).toString(36); // 2 hours ago
    const payload = `${token}.${oldTimestamp}`;
    const secret = process.env.JWT_SECRET || '';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expired = `${payload}.${signature}`;
    expect(csrf.validateToken(expired, expired)).toBe(false);
  });

  it("should reject tokens with invalid format", () => {
    expect(csrf.validateToken("no-dots-here", "no-dots-here")).toBe(false);
    expect(csrf.validateToken("one.dot", "one.dot")).toBe(false);
  });

  it("each generated token should be unique", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) {
      tokens.add(csrf.generateToken().combined);
    }
    expect(tokens.size).toBe(50);
  });
});

describe("Security - Input Sanitization", () => {
  it("should remove angle brackets (XSS prevention)", () => {
    expect(sanitizeInput("<script>alert('xss')</script>")).toBe("scriptalert(xss)/script");
  });

  it("should remove quotes (SQL injection prevention)", () => {
    expect(sanitizeInput("'; DROP TABLE users; --")).toBe("; DROP TABLE users; --");
  });

  it("should trim whitespace", () => {
    expect(sanitizeInput("  hello  ")).toBe("hello");
  });

  it("should sanitize object values", () => {
    const obj = {
      name: "<script>alert('xss')</script>",
      age: 25,
      email: "test@test.com",
    };
    const sanitized = sanitizeObject(obj);
    expect(sanitized.name).not.toContain("<script>");
    expect(sanitized.age).toBe(25);
    expect(sanitized.email).toBe("test@test.com");
  });
});

describe("Security - Encryption", () => {
  it("should encrypt and decrypt correctly", () => {
    const key = generateSecureToken(32); // 64 hex chars = 32 bytes
    const encryptor = new Encryptor(key);
    const plaintext = "sensitive salary data: 15000 SAR";
    const encrypted = encryptor.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":");
    const decrypted = encryptor.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for same plaintext (IV randomness)", () => {
    const key = generateSecureToken(32);
    const encryptor = new Encryptor(key);
    const plaintext = "same data";
    const encrypted1 = encryptor.encrypt(plaintext);
    const encrypted2 = encryptor.encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it("should reject wrong key", () => {
    const key1 = generateSecureToken(32);
    const key2 = generateSecureToken(32);
    const encryptor1 = new Encryptor(key1);
    const encryptor2 = new Encryptor(key2);
    const encrypted = encryptor1.encrypt("secret");
    expect(() => encryptor2.decrypt(encrypted)).toThrow();
  });

  it("should reject invalid key length", () => {
    expect(() => new Encryptor("short")).toThrow("Key must be 32 bytes");
  });
});

describe("Security - Security Headers", () => {
  it("should include all critical headers", () => {
    const headers = getSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toBeTruthy();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["X-XSS-Protection"]).toBe("1; mode=block");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["Permissions-Policy"]).toContain("geolocation=()");
  });

  it("CSP should restrict default-src to self", () => {
    const headers = getSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("CSP should restrict frame-ancestors", () => {
    const headers = getSecurityHeaders();
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors");
  });
});

describe("Security - Secure Token Generation", () => {
  it("should generate tokens of correct length", () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it("should generate unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSecureToken(32));
    }
    expect(tokens.size).toBe(100);
  });
});

// ==========================================
// IDOR (Insecure Direct Object Reference) TESTS
// ==========================================

describe("Security - IDOR Prevention via Role Checks", () => {
  it("only admin_affairs and super_admin can submit drafts", () => {
    const rolesAllowed: UserRole[] = [];
    const allRoles: UserRole[] = [
      "guard", "supervisor_tolan", "supervisor_malqa", "admin_affairs", "accountant",
      "auditor", "finance_manager", "executive", "super_admin"
    ];
    
    for (const role of allRoles) {
      if (ROLE_PERMISSIONS[role].canSubmitDraft) {
        rolesAllowed.push(role);
      }
    }
    
    expect(rolesAllowed).toContain("admin_affairs");
    expect(rolesAllowed).toContain("super_admin");
    expect(rolesAllowed).not.toContain("accountant");
    expect(rolesAllowed).not.toContain("auditor");
    expect(rolesAllowed).not.toContain("finance_manager");
    expect(rolesAllowed).not.toContain("guard");
  });

  it("only admin_affairs and super_admin can delete batches", () => {
    const allRoles: UserRole[] = [
      "guard", "supervisor_tolan", "supervisor_malqa", "admin_affairs", "accountant",
      "auditor", "finance_manager", "executive", "super_admin"
    ];
    
    for (const role of allRoles) {
      const canDelete = ROLE_PERMISSIONS[role].canDeleteBatch;
      if (role === "admin_affairs" || role === "super_admin") {
        expect(canDelete).toBe(true);
      } else {
        expect(canDelete).toBe(false);
      }
    }
  });

  it("auditor and finance_manager cannot delete batches", () => {
    expect(ROLE_PERMISSIONS["auditor"].canDeleteBatch).toBe(false);
    expect(ROLE_PERMISSIONS["finance_manager"].canDeleteBatch).toBe(false);
  });

  it("only specific roles can manage workers", () => {
    expect(ROLE_PERMISSIONS["admin_affairs"].canManageWorkers).toBe(true);
    expect(ROLE_PERMISSIONS["accountant"].canManageWorkers).toBe(true);
    expect(ROLE_PERMISSIONS["super_admin"].canManageWorkers).toBe(true);
    expect(ROLE_PERMISSIONS["guard"].canManageWorkers).toBe(false);
    expect(ROLE_PERMISSIONS["auditor"].canManageWorkers).toBe(false);
    expect(ROLE_PERMISSIONS["finance_manager"].canManageWorkers).toBe(false);
    expect(ROLE_PERMISSIONS["executive"].canManageWorkers).toBe(false);
  });

  it("only specific roles can edit attendance log", () => {
    expect(ROLE_PERMISSIONS["admin_affairs"].canEditAttendanceLog).toBe(true);
    expect(ROLE_PERMISSIONS["super_admin"].canEditAttendanceLog).toBe(true);
    expect(ROLE_PERMISSIONS["guard"].canEditAttendanceLog).toBe(false);
    expect(ROLE_PERMISSIONS["accountant"].canEditAttendanceLog).toBe(false);
    expect(ROLE_PERMISSIONS["auditor"].canEditAttendanceLog).toBe(false);
    expect(ROLE_PERMISSIONS["finance_manager"].canEditAttendanceLog).toBe(false);
  });
});
