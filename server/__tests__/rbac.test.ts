import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS, hasPageAccess, canApproveBatchAtStage, canRejectBatchAtStage, cannotSelfReview, getRoleLabel, getAllRoles, isSupervisorRole } from "../permissions";
import type { UserRole } from "../../drizzle/schema";
import { userRoleEnum } from "../../drizzle/schema";

describe("RBAC - Role Definitions", () => {
  it("should have exactly 9 roles defined", () => {
    expect(userRoleEnum).toHaveLength(9);
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(9);
  });

  it("should have all 9 expected roles", () => {
    const expectedRoles: UserRole[] = [
      "guard", "supervisor_tolan", "supervisor_malqa", "admin_affairs", "accountant",
      "auditor", "finance_manager", "executive", "super_admin"
    ];
    for (const role of expectedRoles) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("each role should have Arabic and English labels", () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      expect(perms.label).toBeTruthy();
      expect(perms.labelAr).toBeTruthy();
    }
  });
});

describe("RBAC - Page Access", () => {
  it("guard can only access attendance page", () => {
    expect(hasPageAccess("guard", "attendance")).toBe(true);
    expect(hasPageAccess("guard", "workers")).toBe(false);
    expect(hasPageAccess("guard", "payroll")).toBe(false);
    expect(hasPageAccess("guard", "operations")).toBe(false);
    expect(hasPageAccess("guard", "executiveDashboard")).toBe(false);
  });

  it("supervisor_tolan can only access operations page", () => {
    expect(hasPageAccess("supervisor_tolan", "operations")).toBe(true);
    expect(hasPageAccess("supervisor_tolan", "attendance")).toBe(false);
    expect(hasPageAccess("supervisor_tolan", "workers")).toBe(false);
    expect(hasPageAccess("supervisor_tolan", "payroll")).toBe(false);
  });

  it("supervisor_malqa can only access operations page", () => {
    expect(hasPageAccess("supervisor_malqa", "operations")).toBe(true);
    expect(hasPageAccess("supervisor_malqa", "attendance")).toBe(false);
    expect(hasPageAccess("supervisor_malqa", "workers")).toBe(false);
    expect(hasPageAccess("supervisor_malqa", "payroll")).toBe(false);
  });

  it("admin_affairs has broad access except executive dashboard", () => {
    expect(hasPageAccess("admin_affairs", "attendance")).toBe(true);
    expect(hasPageAccess("admin_affairs", "workers")).toBe(true);
    expect(hasPageAccess("admin_affairs", "groups")).toBe(true);
    expect(hasPageAccess("admin_affairs", "costCenters")).toBe(true);
    expect(hasPageAccess("admin_affairs", "payroll")).toBe(true);
    expect(hasPageAccess("admin_affairs", "reports")).toBe(true);
    expect(hasPageAccess("admin_affairs", "operations")).toBe(true);
    expect(hasPageAccess("admin_affairs", "operationsReview")).toBe(true);
    expect(hasPageAccess("admin_affairs", "executiveDashboard")).toBe(false);
  });

  it("executive can only access executive dashboard", () => {
    expect(hasPageAccess("executive", "executiveDashboard")).toBe(true);
    expect(hasPageAccess("executive", "attendance")).toBe(false);
    expect(hasPageAccess("executive", "payroll")).toBe(false);
    expect(hasPageAccess("executive", "workers")).toBe(false);
  });

  it("super_admin has access to all pages", () => {
    expect(hasPageAccess("super_admin", "attendance")).toBe(true);
    expect(hasPageAccess("super_admin", "workers")).toBe(true);
    expect(hasPageAccess("super_admin", "payroll")).toBe(true);
    expect(hasPageAccess("super_admin", "operations")).toBe(true);
    expect(hasPageAccess("super_admin", "executiveDashboard")).toBe(true);
    expect(hasPageAccess("super_admin", "anyRandomPage")).toBe(true);
  });

  it("auditor can access payroll, reports, and attendanceLog only", () => {
    expect(hasPageAccess("auditor", "payroll")).toBe(true);
    expect(hasPageAccess("auditor", "reports")).toBe(true);
    expect(hasPageAccess("auditor", "attendanceLog")).toBe(true);
    expect(hasPageAccess("auditor", "attendance")).toBe(false);
    expect(hasPageAccess("auditor", "workers")).toBe(false);
    expect(hasPageAccess("auditor", "operations")).toBe(false);
  });

  it("finance_manager can access payroll, reports, and attendanceLog only", () => {
    expect(hasPageAccess("finance_manager", "payroll")).toBe(true);
    expect(hasPageAccess("finance_manager", "reports")).toBe(true);
    expect(hasPageAccess("finance_manager", "attendanceLog")).toBe(true);
    expect(hasPageAccess("finance_manager", "attendance")).toBe(false);
    expect(hasPageAccess("finance_manager", "workers")).toBe(false);
    expect(hasPageAccess("finance_manager", "operations")).toBe(false);
  });
});

// ============================================
// دورة اعتماد الرواتب - التسلسل الصحيح
// ============================================
// 1. الشؤون الإدارية (admin_affairs) تنشئ المسودة (draft) وترسلها للمحاسب
// 2. المحاسب (accountant) يراجع → يعتمد (ترسل للمراجع) أو يرفض (تعود draft)
// 3. المراجع (auditor) يراجع → يعتمد (ترسل للمدير المالي) أو يرفض (تعود draft)
// 4. المدير المالي (finance_manager) يعتمد نهائياً أو يرفض (تعود draft)

describe("RBAC - Batch Approval Workflow (New Sequential Flow)", () => {
  // === المرحلة 1: المسودة (draft) ===
  describe("Stage 1: Draft → Submit to Accountant", () => {
    it("admin_affairs can submit draft batches", () => {
      expect(canApproveBatchAtStage("admin_affairs", "draft").allowed).toBe(true);
    });

    it("accountant CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("accountant", "draft").allowed).toBe(false);
    });

    it("auditor CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("auditor", "draft").allowed).toBe(false);
    });

    it("finance_manager CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("finance_manager", "draft").allowed).toBe(false);
    });

    it("guard CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("guard", "draft").allowed).toBe(false);
    });

    it("executive CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("executive", "draft").allowed).toBe(false);
    });

    it("supervisor_tolan CANNOT submit draft batches", () => {
      expect(canApproveBatchAtStage("supervisor_tolan", "draft").allowed).toBe(false);
    });
  });

  // === المرحلة 2: مراجعة المحاسب ===
  describe("Stage 2: Accountant Review", () => {
    it("accountant can approve/reject at accountant review stage", () => {
      expect(canApproveBatchAtStage("accountant", "under_accountant_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("accountant", "under_accountant_review").allowed).toBe(true);
    });

    it("auditor CAN act at accountant review stage (optional skip of accountant)", () => {
      expect(canApproveBatchAtStage("auditor", "under_accountant_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("auditor", "under_accountant_review").allowed).toBe(true);
    });

    it("finance_manager CANNOT act at accountant review stage", () => {
      expect(canApproveBatchAtStage("finance_manager", "under_accountant_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("finance_manager", "under_accountant_review").allowed).toBe(false);
    });

    it("admin_affairs CANNOT act at accountant review stage", () => {
      expect(canApproveBatchAtStage("admin_affairs", "under_accountant_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("admin_affairs", "under_accountant_review").allowed).toBe(false);
    });
  });

  // === المرحلة 3: مراجعة المراجع المالي ===
  describe("Stage 3: Auditor (Financial Reviewer) Review", () => {
    it("auditor can approve/reject at financial review stage", () => {
      expect(canApproveBatchAtStage("auditor", "under_financial_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("auditor", "under_financial_review").allowed).toBe(true);
    });

    it("accountant CANNOT act at financial review stage", () => {
      expect(canApproveBatchAtStage("accountant", "under_financial_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("accountant", "under_financial_review").allowed).toBe(false);
    });

    it("finance_manager CANNOT act at financial review stage", () => {
      expect(canApproveBatchAtStage("finance_manager", "under_financial_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("finance_manager", "under_financial_review").allowed).toBe(false);
    });

    it("admin_affairs CANNOT act at financial review stage", () => {
      expect(canApproveBatchAtStage("admin_affairs", "under_financial_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("admin_affairs", "under_financial_review").allowed).toBe(false);
    });
  });

  // === المرحلة 4: اعتماد المدير المالي ===
  describe("Stage 4: Finance Manager Final Approval", () => {
    it("finance_manager can approve/reject at final stage", () => {
      expect(canApproveBatchAtStage("finance_manager", "under_accounts_manager_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("finance_manager", "under_accounts_manager_review").allowed).toBe(true);
    });

    it("auditor CANNOT act at final stage", () => {
      expect(canApproveBatchAtStage("auditor", "under_accounts_manager_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("auditor", "under_accounts_manager_review").allowed).toBe(false);
    });

    it("accountant CANNOT act at final stage", () => {
      expect(canApproveBatchAtStage("accountant", "under_accounts_manager_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("accountant", "under_accounts_manager_review").allowed).toBe(false);
    });

    it("admin_affairs CANNOT act at final stage", () => {
      expect(canApproveBatchAtStage("admin_affairs", "under_accounts_manager_review").allowed).toBe(false);
      expect(canRejectBatchAtStage("admin_affairs", "under_accounts_manager_review").allowed).toBe(false);
    });
  });

  // === Super Admin ===
  describe("Super Admin Override", () => {
    it("super_admin can act at any stage", () => {
      expect(canApproveBatchAtStage("super_admin", "draft").allowed).toBe(true);
      expect(canApproveBatchAtStage("super_admin", "under_accountant_review").allowed).toBe(true);
      expect(canApproveBatchAtStage("super_admin", "under_financial_review").allowed).toBe(true);
      expect(canApproveBatchAtStage("super_admin", "under_accounts_manager_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("super_admin", "under_accountant_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("super_admin", "under_financial_review").allowed).toBe(true);
      expect(canRejectBatchAtStage("super_admin", "under_accounts_manager_review").allowed).toBe(true);
    });
  });
});

describe("RBAC - Delete Permissions", () => {
  it("auditor CANNOT delete batches", () => {
    expect(ROLE_PERMISSIONS.auditor.canDeleteBatch).toBe(false);
  });

  it("finance_manager CANNOT delete batches", () => {
    expect(ROLE_PERMISSIONS.finance_manager.canDeleteBatch).toBe(false);
  });

  it("admin_affairs CAN delete batches", () => {
    expect(ROLE_PERMISSIONS.admin_affairs.canDeleteBatch).toBe(true);
  });

  it("super_admin CAN delete batches", () => {
    expect(ROLE_PERMISSIONS.super_admin.canDeleteBatch).toBe(true);
  });

  it("accountant CANNOT delete batches", () => {
    expect(ROLE_PERMISSIONS.accountant.canDeleteBatch).toBe(false);
  });
});

describe("RBAC - Draft Submission Permissions", () => {
  it("only admin_affairs and super_admin can submit drafts", () => {
    const draftSubmitters = Object.entries(ROLE_PERMISSIONS)
      .filter(([_, perms]) => perms.canSubmitDraft)
      .map(([role]) => role)
      .sort();
    expect(draftSubmitters).toEqual(["admin_affairs", "super_admin"]);
  });

  it("auditor CANNOT submit drafts", () => {
    expect(ROLE_PERMISSIONS.auditor.canSubmitDraft).toBe(false);
  });

  it("accountant CANNOT submit drafts", () => {
    expect(ROLE_PERMISSIONS.accountant.canSubmitDraft).toBe(false);
  });

  it("finance_manager CANNOT submit drafts", () => {
    expect(ROLE_PERMISSIONS.finance_manager.canSubmitDraft).toBe(false);
  });
});

describe("RBAC - Supervisor Tolan: No Operations Review", () => {
  it("supervisor_tolan does NOT have operationsReview page access", () => {
    expect(hasPageAccess("supervisor_tolan", "operationsReview")).toBe(false);
  });

  it("supervisor_malqa does NOT have operationsReview page access", () => {
    expect(hasPageAccess("supervisor_malqa", "operationsReview")).toBe(false);
  });
});

describe("RBAC - Self Review Prevention", () => {
  it("accountant cannot review their own batch", () => {
    expect(cannotSelfReview(100, 100, "accountant")).toBe(true);
  });

  it("accountant can review someone else's batch", () => {
    expect(cannotSelfReview(100, 200, "accountant")).toBe(false);
  });

  it("super_admin bypasses self-review check", () => {
    expect(cannotSelfReview(100, 100, "super_admin")).toBe(false);
  });

  it("auditor is not subject to self-review restriction", () => {
    expect(cannotSelfReview(100, 100, "auditor")).toBe(false);
  });
});

describe("RBAC - Role Capabilities", () => {
  it("only admin_affairs can create batches (accountant no longer creates)", () => {
    const batchCreators = Object.entries(ROLE_PERMISSIONS)
      .filter(([role, perms]) => perms.canCreateBatch && role !== "super_admin")
      .map(([role]) => role);
    expect(batchCreators.sort()).toEqual(["admin_affairs"]);
  });

  it("both supervisor roles are restricted by cost center", () => {
    const restricted = Object.entries(ROLE_PERMISSIONS)
      .filter(([_, perms]) => perms.restrictedByCostCenter)
      .map(([role]) => role)
      .sort();
    expect(restricted).toEqual(["supervisor_malqa", "supervisor_tolan"]);
  });

  it("isSupervisorRole correctly identifies supervisor roles", () => {
    expect(isSupervisorRole("supervisor_tolan")).toBe(true);
    expect(isSupervisorRole("supervisor_malqa")).toBe(true);
    expect(isSupervisorRole("guard")).toBe(false);
    expect(isSupervisorRole("admin_affairs")).toBe(false);
    expect(isSupervisorRole("super_admin")).toBe(false);
  });

  it("only super_admin can manage users", () => {
    const userManagers = Object.entries(ROLE_PERMISSIONS)
      .filter(([_, perms]) => perms.canManageUsers)
      .map(([role]) => role);
    expect(userManagers).toEqual(["super_admin"]);
  });

  it("executive can view executive dashboard", () => {
    expect(ROLE_PERMISSIONS.executive.canViewExecutiveDashboard).toBe(true);
  });

  it("guard has no management capabilities", () => {
    const guard = ROLE_PERMISSIONS.guard;
    expect(guard.canCreateBatch).toBe(false);
    expect(guard.canManageWorkers).toBe(false);
    expect(guard.canManageGroups).toBe(false);
    expect(guard.canManageCostCenters).toBe(false);
    expect(guard.canManageUsers).toBe(false);
    expect(guard.canViewFinancialReports).toBe(false);
    expect(guard.canViewAttendanceReports).toBe(false);
    expect(guard.canViewExecutiveDashboard).toBe(false);
    expect(guard.canAccessOperations).toBe(false);
  });
});

describe("RBAC - Helper Functions", () => {
  it("getRoleLabel returns Arabic label by default", () => {
    expect(getRoleLabel("guard")).toBe("حارس");
    expect(getRoleLabel("supervisor_tolan")).toBe("مشرف تولان");
    expect(getRoleLabel("supervisor_malqa")).toBe("مشرف الملقا");
    expect(getRoleLabel("super_admin")).toBe("سوبر أدمن");
  });

  it("getRoleLabel returns English label when specified", () => {
    expect(getRoleLabel("guard", "en")).toBe("Guard");
    expect(getRoleLabel("executive", "en")).toBe("Executive");
    expect(getRoleLabel("supervisor_tolan", "en")).toBe("Supervisor Tolan");
    expect(getRoleLabel("supervisor_malqa", "en")).toBe("Supervisor Malqa");
  });

  it("getAllRoles returns all 9 roles", () => {
    const roles = getAllRoles();
    expect(roles).toHaveLength(9);
    expect(roles.every(r => r.value && r.label && r.labelAr)).toBe(true);
  });
});
