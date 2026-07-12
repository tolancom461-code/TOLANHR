import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Link } from "wouter";

export default function PayrollBatchCreateSimple() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshFinanceRecords, setRefreshFinanceRecords] = useState(true); // ✅ تفعيل إعادة الحساب تلقائياً
  const [pendingGroupIdFromLink, setPendingGroupIdFromLink] = useState<number | null>(null);

  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: costCenterGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: costCenterId ? parseInt(costCenterId) : undefined },
    { enabled: !!costCenterId }
  );
  const { data: recentChanges } = trpc.groupSchedules.getRecentChanges.useQuery({ hoursThreshold: 24 });
  const { data: pendingFlagsCount } = (trpc as any).operationalDashboard?.getPendingCount?.useQuery?.() || { data: 0 };
  const hasPendingFlags = (pendingFlagsCount ?? 0) > 0;

  // ✅ تعبئة تلقائية عند القدوم من "تقرير تغطية المجموعات" برابط يحتوي معاملات جاهزة
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qCostCenterId = params.get('costCenterId');
    const qGroupId = params.get('groupId');
    const qPeriodStart = params.get('periodStart');
    const qPeriodEnd = params.get('periodEnd');

    if (qPeriodStart) setPeriodStart(qPeriodStart);
    if (qPeriodEnd) setPeriodEnd(qPeriodEnd);
    if (qCostCenterId) setCostCenterId(qCostCenterId);
    if (qGroupId) setPendingGroupIdFromLink(parseInt(qGroupId));
  }, []);

  // بعد تحميل مجموعات مركز التكلفة المُعبَّأ تلقائياً، حدّد المجموعة المطلوبة تحديداً
  useEffect(() => {
    if (pendingGroupIdFromLink && costCenterGroups?.some((g: any) => g.id === pendingGroupIdFromLink)) {
      setSelectedGroupIds([pendingGroupIdFromLink]);
      setPendingGroupIdFromLink(null);
    }
  }, [costCenterGroups, pendingGroupIdFromLink]);

  // Auto-select all groups when cost center changes
  const handleCostCenterChange = (value: string) => {
    setCostCenterId(value);
    setSelectedGroupIds([]);
  };

  const handleToggleGroup = (groupId: number) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSelectAll = () => {
    setSelectedGroupIds((costCenterGroups || []).map((g: any) => g.id));
  };

  const handleDeselectAll = () => {
    setSelectedGroupIds([]);
  };

  const aggregateMutation = trpc.payroll.aggregatePayrollDataByCostCenter.useMutation();
  const createBatchMutation = trpc.payroll.createBatch.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log("=== Form submitted! ===");
    console.log("periodStart:", periodStart);
    console.log("periodEnd:", periodEnd);
    console.log("costCenterId:", costCenterId);

    if (!periodStart || !periodEnd || !costCenterId) {
      setError("يرجى ملء جميع الحقول");
      return;
    }

    if (selectedGroupIds.length === 0) {
      setError("يرجى تحديد مجموعة واحدة على الأقل");
      return;
    }
    
    // Check if groups in this cost center have schedules
    try {
      const groupsWithoutSchedules = await utils.groups.listWithoutSchedules.fetch();
      const selectedCostCenterGroups = groupsWithoutSchedules.filter(
        (g: any) => g.costCenterId === parseInt(costCenterId)
      );
      
      if (selectedCostCenterGroups.length > 0) {
        const groupNames = selectedCostCenterGroups.map((g: any) => g.name).join('، ');
        setError(
          `المجموعات التالية لا تحتوي على جدول أسبوعي: ${groupNames}. يرجى إضافة جداول أولاً من صفحة الورديات الأسبوعية.`
        );
        return;
      }
    } catch (err) {
      console.error("Error checking schedules:", err);
    }
    
    // Check for recent schedule changes
    if (recentChanges && recentChanges.length > 0) {
      const recentGroupNames = recentChanges.map((c: any) => {
        const hoursAgo = Math.round((Date.now() - new Date(c.lastModified).getTime()) / (1000 * 60 * 60));
        return `${c.groupName} (تم التعديل منذ ${hoursAgo} ساعة)`;
      }).join('، ');
      
      const confirmed = window.confirm(
        `⚠️ تنبيه: تم تعديل الجداول الأسبوعية للمجموعات التالية خلال آخر 24 ساعة:\n\n${recentGroupNames}\n\nهل أنت متأكد من أن البيانات صحيحة وتريد المتابعة؟`
      );
      
      if (!confirmed) {
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      console.log("=== Calling aggregatePayrollData ===");
      const aggregateResult = await aggregateMutation.mutateAsync({
        periodStart,
        periodEnd,
        costCenterId: parseInt(costCenterId),
        groupIds: selectedGroupIds,
      });

      console.log("=== Aggregate result ===", aggregateResult);

      if (!aggregateResult || aggregateResult.length === 0) {
        setError("لم يتم العثور على بيانات أجور للفترة المحددة");
        setLoading(false);
        return;
      }

      console.log("=== Creating batch ===");
      const batch = await createBatchMutation.mutateAsync({
        periodStart,
        periodEnd,
        costCenterId: parseInt(costCenterId),
        refreshFinanceRecords,
        groupIds: selectedGroupIds,
        items: aggregateResult.map((item: any) => ({
          workerId: item.workerId,
          baseAmount: item.baseAmount,
          deductions: item.deductions,
          bonuses: item.bonuses,
          netAmount: item.netAmount,
          daysWorked: item.daysWorked || 0,
          notes: item.notes || undefined,
        })),
      });

      console.log("=== Batch created ===", batch);
      setSuccess(`تم إنشاء دفعة العمال بنجاح! رقم الدفعة: ${batch.batchId}`);
      
      setTimeout(() => {
        setLocation(`/payroll/batches/${batch.batchId}`);
      }, 2000);
    } catch (err: any) {
      console.error("=== Error ===", err);
      setError(err.message || "حدث خطأ أثناء إنشاء دفعة العمال");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "20px" }}>
        إنشاء دفعة العمال جديدة
      </h1>

      {hasPendingFlags && (
        <div
          style={{
            padding: "16px",
            backgroundColor: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", color: "#856404" }}>
            ⚠️ تنبيه: يوجد {pendingFlagsCount} ملاحظة تشغيلية معلقة
          </div>
          <p style={{ color: "#856404", margin: 0 }}>
            لا يمكن إنشاء دفعة العمال قبل معالجة جميع الملاحظات التشغيلية المعلقة. يرجى مراجعتها واعتمادها أولاً.
          </p>
          <Link href="/operations/notes-review">
            <span
              style={{
                display: "inline-block",
                padding: "8px 16px",
                backgroundColor: "#856404",
                color: "white",
                borderRadius: "4px",
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
              }}
            >
              الانتقال لمعالجات الملاحظات التشغيلية
            </span>
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            padding: "16px",
            backgroundColor: "#e3f2fd",
            border: "1px solid #2196f3",
            borderRadius: "8px",
            display: "flex",
            alignItems: "start",
            gap: "12px",
          }}
        >
          <input
            type="checkbox"
            id="refresh-finance"
            checked={refreshFinanceRecords}
            onChange={(e) => setRefreshFinanceRecords(e.target.checked)}
            style={{
              width: "20px",
              height: "20px",
              marginTop: "2px",
              cursor: "pointer",
            }}
          />
          <div style={{ flex: 1 }}>
            <label
              htmlFor="refresh-finance"
              style={{
                display: "block",
                fontWeight: "500",
                color: "#1976d2",
                cursor: "pointer",
                marginBottom: "4px",
              }}
            >
              تحديث السجلات المالية (العمال والورديات) بناءً على الإعدادات الحالية
            </label>
            <p style={{ margin: 0, fontSize: "14px", color: "#555" }}>
              سيتم إعادة حساب السجلات المالية غير المعتمدة فقط بناءً على أحدث العمال وورديات في المجموعات
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="period-start" style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
            من تاريخ
          </label>
          <input
            id="period-start"
            type="date"
            value={periodStart}
            onChange={(e) => {
              console.log("periodStart changed:", e.target.value);
              setPeriodStart(e.target.value);
            }}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "16px",
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="period-end" style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
            إلى تاريخ
          </label>
          <input
            id="period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => {
              console.log("periodEnd changed:", e.target.value);
              setPeriodEnd(e.target.value);
            }}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "16px",
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="cost-center" style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
            مركز التكلفة
          </label>
          <select
            id="cost-center"
            value={costCenterId}
            onChange={(e) => {
              console.log("costCenterId changed:", e.target.value);
              handleCostCenterChange(e.target.value);
            }}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "16px",
            }}
            required
          >
            <option value="">اختر مركز التكلفة</option>
            {costCenters?.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name}
              </option>
            ))}
          </select>
        </div>

        {/* ③ اختيار المجموعات — تظهر بعد اختيار مركز التكلفة */}
        {costCenterId && costCenterGroups && costCenterGroups.length > 0 && (
          <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <label style={{ fontWeight: "600", fontSize: "15px" }}>
                المجموعات ({selectedGroupIds.length} / {costCenterGroups.length} محددة)
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{ padding: "4px 10px", fontSize: "13px", border: "1px solid #0066cc", borderRadius: "4px", background: "#fff", color: "#0066cc", cursor: "pointer" }}
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  style={{ padding: "4px 10px", fontSize: "13px", border: "1px solid #aaa", borderRadius: "4px", background: "#fff", color: "#555", cursor: "pointer" }}
                >
                  إلغاء الكل
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {costCenterGroups.map((group: any) => (
                <label
                  key={group.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: selectedGroupIds.includes(group.id) ? "#e3f2fd" : "#f9f9f9",
                    border: selectedGroupIds.includes(group.id) ? "1px solid #2196f3" : "1px solid #eee",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(group.id)}
                    onChange={() => handleToggleGroup(group.id)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ fontWeight: selectedGroupIds.includes(group.id) ? "600" : "400" }}>
                    {group.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {costCenterId && !costCenterGroups?.length && (
          <div style={{ padding: "12px", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "6px", color: "#856404" }}>
            لا توجد مجموعات مرتبطة بهذا مركز التكلفة
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "#fee",
              border: "1px solid #fcc",
              borderRadius: "4px",
              color: "#c00",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: "12px",
              backgroundColor: "#efe",
              border: "1px solid #cfc",
              borderRadius: "4px",
              color: "#0c0",
            }}
          >
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          onClick={() => console.log("=== Button clicked! ===")}
          style={{
            padding: "12px 24px",
            backgroundColor: loading ? "#ccc" : "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "16px",
            fontWeight: "500",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "جاري الاحتساب..." : "احتساب وإنشاء دفعة العمال"}
        </button>
      </form>
    </div>
  );
}
