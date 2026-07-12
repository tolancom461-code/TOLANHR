"use client";

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  Loader2,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

interface CalculatedPayrollData {
  workerId: number;
  workerName: string;
  groupId: number;
  groupName: string;
  daysWorked: number;
  baseAmount: number;
  deductions: number;
  bonuses: number;
  netAmount: number;
}

interface PayrollSummary {
  totalWorkers: number;
  totalDays: number;
  totalBase: number;
  totalDeductions: number;
  totalBonuses: number;
  totalNet: number;
}

export default function PayrollBatchCreate() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast.error("يرجى تسجيل الدخول أولاً");
      setLocation("/local-login");
    }
  }, [user, authLoading, setLocation]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [costCenterId, setCostCenterId] = useState<number | undefined>();
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [calculatedData, setCalculatedData] = useState<CalculatedPayrollData[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [payrollSummary, setPayrollSummary] = useState<PayrollSummary | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [refreshFinanceRecords, setRefreshFinanceRecords] = useState(true); // ✅ تفعيل إعادة الحساب تلقائياً

  // Get groups filtered by cost center
  const { data: allGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId },
    { enabled: true }
  );
  const { data: allWorkers } = trpc.workers.list.useQuery();
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: unresolvedData } = trpc.operationalFlags.checkUnresolved.useQuery(
    {
      groupId: selectedGroupIds.size > 0 ? Array.from(selectedGroupIds)[0] : undefined,
      dateRange: periodStart && periodEnd ? {
        start: new Date(periodStart),
        end: new Date(periodEnd),
      } : undefined,
    } as any,
    {
      enabled: !!periodStart && !!periodEnd,
    }
  );

  // Mutations
  const calculateDailyFinancesMutation = trpc.payroll.calculateDailyFinancesForPeriod.useMutation();

  const createMutation = trpc.payroll.createBatch.useMutation({
    onSuccess: (data) => {
      toast.success("تم إنشاء دفعة العمال بنجاح");
      setLocation(`/payroll/batches/${data.batchId}`);
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  // Filter groups by cost center
  const groups = costCenterId
    ? allGroups?.filter((g) => g.costCenterId === costCenterId)
    : allGroups;

  // Handle group selection
  const toggleGroup = (groupId: number) => {
    const newSelected = new Set(selectedGroupIds);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroupIds(newSelected);
  };

  const selectAllGroups = () => {
    if (groups) {
      setSelectedGroupIds(new Set(groups.map((g) => g.id)));
    }
  };

  const deselectAllGroups = () => {
    setSelectedGroupIds(new Set());
  };

  // Handle payroll calculation with API
  const handleCalculatePayroll = async () => {
    if (!periodStart || !periodEnd) {
      toast.error("يرجى تحديد الفترة الزمنية");
      return;
    }

    if (new Date(periodStart) > new Date(periodEnd)) {
      toast.error("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
      return;
    }

    if (!costCenterId) {
      toast.error("يرجى اختيار مركز التكلفة");
      return;
    }

    // If no specific groups selected, use all groups in cost center
    let groupsToCalculate = Array.from(selectedGroupIds);
    if (groupsToCalculate.length === 0 && groups) {
      groupsToCalculate = groups.map((g) => g.id);
    }

    if (groupsToCalculate.length === 0) {
      toast.error("لا توجد مجموعات في مركز التكلفة المختار");
      return;
    }

    setIsCalculating(true);
    try {
      // Get workers for selected groups
      const workersInGroups = allWorkers?.filter((w) =>
        w.groupId && groupsToCalculate.includes(w.groupId)
      ) || [];

      if (workersInGroups.length === 0) {
        toast.error("لا يوجد عمال في المجموعات المختارة");
        setIsCalculating(false);
        return;
      }

      const results: CalculatedPayrollData[] = [];
      let totalBase = 0;
      let totalDeductions = 0;
      let totalBonuses = 0;
      let totalDays = 0;

      // Step 1: Calculate daily finances for each worker
      // This populates the worker_daily_finance table from attendance data
      for (const worker of workersInGroups) {
        try {
          console.log(`[Payroll] Calculating daily finances for worker ${worker.id}...`);
          await calculateDailyFinancesMutation.mutateAsync({
            workerId: worker.id,
            periodStart,
            periodEnd,
          });
        } catch (error) {
          console.error(`Error calculating daily finances for worker ${worker.id}:`, error);
          toast.error(`خطأ في حساب أجور العامل ${worker.fullName || worker.code}`);
        }
      }

      // Step 2: Fetch aggregated payroll data for each worker
      // This retrieves the calculated daily finances + pay overrides
      for (const worker of workersInGroups) {
        try {
          console.log(`[Payroll] Fetching aggregated payroll data for worker ${worker.id}...`);
          
          // Use fetch to call the aggregatePayrollData query
          const response = await fetch(
            `/api/trpc/payroll.aggregatePayrollData?input=${encodeURIComponent(
              JSON.stringify({
                workerId: worker.id,
                periodStart,
                periodEnd,
              })
            )}`
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const jsonData = await response.json();
          const aggregated = jsonData.result?.data;

          if (!aggregated) {
            console.warn(`No payroll data found for worker ${worker.id}`);
            continue;
          }

          const group = groups?.find((g) => g.id === worker.groupId);

          results.push({
            workerId: worker.id,
            workerName: worker.fullName || worker.code || `عامل #${worker.id}`,
            groupId: worker.groupId || 0,
            groupName: group?.name || "غير محدد",
            daysWorked: aggregated.daysWorked || 0,
            baseAmount: parseFloat(aggregated.baseAmount || "0"),
            deductions: parseFloat(aggregated.deductionsTotal || "0"),
            bonuses: parseFloat(aggregated.bonuses || "0"),
            netAmount: parseFloat(aggregated.netAmount || "0"),
          });

          totalBase += parseFloat(aggregated.baseAmount || "0");
          totalDeductions += parseFloat(aggregated.deductionsTotal || "0");
          totalBonuses += parseFloat(aggregated.bonuses || "0");
          totalDays += aggregated.daysWorked || 0;
        } catch (error) {
          console.error(`Error aggregating payroll for worker ${worker.id}:`, error);
        }
      }

      if (results.length === 0) {
        toast.error("لم يتم العثور على بيانات أجور للفترة المحددة");
        setIsCalculating(false);
        return;
      }

      setCalculatedData(results);
      setPayrollSummary({
        totalWorkers: results.length,
        totalDays,
        totalBase,
        totalDeductions,
        totalBonuses,
        totalNet: totalBase - totalDeductions + totalBonuses,
      });

      toast.success(`تم احتساب أجور ${results.length} عامل بنجاح`);
    } catch (error) {
      toast.error("حدث خطأ أثناء احتساب الأجور");
      console.error(error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!periodStart || !periodEnd) {
      toast.error("يرجى تحديد الفترة الزمنية");
      return;
    }

    if (calculatedData.length === 0) {
      toast.error("يرجى احتساب الأجور أولاً");
      return;
    }

    if (unresolvedData && unresolvedData.count > 0) {
      toast.error(`لا يمكن إنشاء دفعة العمال. يوجد ${unresolvedData.count} بلاغ تشغيلي غير معالج.`);
      return;
    }

    createMutation.mutate({
      periodStart,
      periodEnd,
      groupId: selectedGroupIds.size > 0 ? Array.from(selectedGroupIds)[0] : undefined,
      costCenterId,
      refreshFinanceRecords, // ✅ NEW: إعادة حساب السجلات المالية
      items: [], // Empty items - will be populated later
    });
  };

  const toggleRowExpand = (workerId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(workerId)) {
      newExpanded.delete(workerId);
    } else {
      newExpanded.add(workerId);
    }
    setExpandedRows(newExpanded);
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            إنشاء مسودة العمال جديدة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Period Selection */}
            <div className="space-y-4 border-b pb-6">
              <h3 className="font-semibold text-lg">الخطوة 1: تحديد الفترة الزمنية</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="period-start">من تاريخ</Label>
                  <Input
                    id="period-start"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="period-end">إلى تاريخ</Label>
                  <Input
                    id="period-end"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Cost Center Selection */}
            <div className="space-y-4 border-b pb-6">
              <h3 className="font-semibold text-lg">الخطوة 2: اختيار مركز التكلفة</h3>
              <div>
                <Label htmlFor="cost-center">مركز التكلفة</Label>
                <Select
                  value={costCenterId?.toString() || ""}
                  onValueChange={(value) => {
                    setCostCenterId(value ? parseInt(value) : undefined);
                    setSelectedGroupIds(new Set()); // Reset groups when cost center changes
                  }}
                >
                  <SelectTrigger id="cost-center">
                    <SelectValue placeholder="اختر مركز التكلفة" />
                  </SelectTrigger>
                  <SelectContent>
                    {costCenters?.map((cc) => (
                      <SelectItem key={cc.id} value={cc.id.toString()}>
                        {cc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Step 3: Group Selection (Optional) */}
            {costCenterId && (
              <div className="space-y-4 border-b pb-6">
                <h3 className="font-semibold text-lg">الخطوة 3: اختيار المجموعات (اختياري)</h3>
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllGroups}
                  >
                    تحديد الكل
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllGroups}
                  >
                    إلغاء التحديد
                  </Button>
                </div>
                <div className="space-y-2">
                  {groups?.map((group) => (
                    <div key={group.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={selectedGroupIds.has(group.id)}
                        onCheckedChange={() => toggleGroup(group.id)}
                      />
                      <Label htmlFor={`group-${group.id}`} className="cursor-pointer">
                        {group.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 4: Calculate Button */}
            <div className="space-y-4">
              <Button
                type="button"
                onClick={handleCalculatePayroll}
                disabled={
                  !periodStart ||
                  !periodEnd ||
                  !costCenterId ||
                  isCalculating ||
                  calculateDailyFinancesMutation.isPending
                }
                className="w-full"
              >
                {isCalculating || calculateDailyFinancesMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    جاري احتساب الأجور...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-4 w-4" />
                    احتساب الأجور
                  </>
                )}
              </Button>
            </div>

            {/* Payroll Summary */}
            {payrollSummary && (
              <div className="space-y-4 border-t pt-6">
                <h3 className="font-semibold text-lg">ملخص الأجور المحسوبة</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card className="bg-blue-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">عدد العمال</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {payrollSummary.totalWorkers}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">إجمالي الأيام</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {payrollSummary.totalDays}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">الأجور الأساسية</p>
                      <p className="text-2xl font-bold text-green-600">
                        {payrollSummary.totalBase.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">الخصومات</p>
                      <p className="text-2xl font-bold text-red-600">
                        {payrollSummary.totalDeductions.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-amber-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">المكافآت</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {payrollSummary.totalBonuses.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-indigo-50">
                    <CardContent className="pt-4">
                      <p className="text-sm text-gray-600">الصافي</p>
                      <p className="text-2xl font-bold text-indigo-600">
                        {payrollSummary.totalNet.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Payroll Data Table */}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>اسم العامل</TableHead>
                        <TableHead>المجموعة</TableHead>
                        <TableHead className="text-right">الأيام</TableHead>
                        <TableHead className="text-right">الأساسي</TableHead>
                        <TableHead className="text-right">الخصومات</TableHead>
                        <TableHead className="text-right">المكافآت</TableHead>
                        <TableHead className="text-right">الصافي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculatedData.map((row) => (
                        <TableRow key={row.workerId}>
                          <TableCell>{row.workerName}</TableCell>
                          <TableCell>{row.groupName}</TableCell>
                          <TableCell className="text-right">{row.daysWorked}</TableCell>
                          <TableCell className="text-right text-green-600 font-semibold">
                            {row.baseAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-semibold">
                            {row.deductions.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-amber-600 font-semibold">
                            {row.bonuses.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-indigo-600 font-bold">
                            {row.netAmount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Financial Sync Checkbox */}
                <div className="flex items-start space-x-2 space-x-reverse p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Checkbox
                    id="refreshFinanceRecords"
                    checked={refreshFinanceRecords}
                    onCheckedChange={(checked) => setRefreshFinanceRecords(checked === true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="refreshFinanceRecords"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      تحديث السجلات المالية (العمال والورديات) بناءً على الإعدادات الحالية
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      سيتم إعادة حساب السجلات المالية غير المعتمدة فقط بناءً على أحدث العمال وورديات في المجموعات
                    </p>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      جاري إنشاء الدفعة...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      إنشاء دفعة العمال
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
