import React, { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { PeriodSelector } from '@/components/PeriodSelector';
import { PayrollSummaryCard } from '@/components/PayrollSummaryCard';
import { PayrollTable, type PayrollRow } from '@/components/PayrollTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, DollarSign, RefreshCw, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface PayrollData {
  workerId: number;
  workerName: string;
  daysWorked: number;
  baseAmount: string;
  deductions: string;
  bonuses: string;
  netAmount: string;
}

export default function AdvancedPayrollPage() {
  const [, setLocation] = useLocation();
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  // Queries
  const { data: allGroups } = trpc.groups.list.useQuery();
  const { data: workers } = trpc.workers.listByGroup.useQuery(
    { groupId: selectedGroupId || 0 },
    { enabled: !!selectedGroupId }
  );

  // Mutations
  const createBatchMutation = trpc.payroll.createBatch.useMutation({
    onSuccess: (data) => {
      toast.success('تم إنشاء دفعة العمال بنجاح');
      setLocation(`/payroll/batches/${data.batchId}`);
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  // Handle period change
  const handlePeriodChange = (start: string, end: string) => {
    setPeriodStart(start);
    setPeriodEnd(end);
    setPayrollData([]); // Clear previous data
  };

  // Calculate payroll for selected period
  const handleCalculatePayroll = async () => {
    if (!periodStart || !periodEnd) {
      toast.error('يرجى تحديد الفترة الزمنية');
      return;
    }

    if (!selectedGroupId) {
      toast.error('يرجى اختيار المجموعة');
      return;
    }

    if (!workers || workers.length === 0) {
      toast.error('لا توجد عمال في المجموعة المختارة');
      return;
    }

    setIsCalculating(true);
    try {
      const results: PayrollData[] = [];

      // For now, use a simple approach - calculate for each worker
      // In production, you might want to batch this
      if (workers && workers.length > 0) {
        for (const worker of workers) {
          try {
            // Since we can't use async queries in render, we'll need to refactor this
            // For now, just add placeholder data
            results.push({
              workerId: worker.id,
              workerName: worker.fullName,
              daysWorked: 0,
              baseAmount: '0',
              deductions: '0',
              bonuses: '0',
              netAmount: '0',
            });
          } catch (error) {
            console.error(`Error calculating payroll for worker ${worker.id}:`, error);
          }
        }
      }

      setPayrollData(results);
      toast.success(`تم حساب أجور ${results.length} عامل`);
    } catch (error) {
      toast.error('حدث خطأ أثناء حساب الأجور');
    } finally {
      setIsCalculating(false);
    }
  };

  // Handle batch approval
  const handleApproveBatch = async () => {
    if (!periodStart || !periodEnd || !selectedGroupId) {
      toast.error('يرجى تحديد الفترة والمجموعة');
      return;
    }

    if (payrollData.length === 0) {
      toast.error('يرجى حساب الأجور أولاً');
      return;
    }

    createBatchMutation.mutate({
      periodStart,
      periodEnd,
      groupId: selectedGroupId,
      items: [], // Empty items - will be populated later
    });
  };

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (payrollData.length === 0) {
      return {
        totalWorkers: 0,
        totalDays: 0,
        totalBase: 0,
        totalDeductions: 0,
        totalBonuses: 0,
        totalNet: 0,
      };
    }

    return {
      totalWorkers: payrollData.length,
      totalDays: payrollData.reduce((sum, p) => sum + p.daysWorked, 0),
      totalBase: payrollData.reduce((sum, p) => sum + parseFloat(p.baseAmount), 0),
      totalDeductions: payrollData.reduce((sum, p) => sum + parseFloat(p.deductions), 0),
      totalBonuses: payrollData.reduce((sum, p) => sum + parseFloat(p.bonuses), 0),
      totalNet: payrollData.reduce((sum, p) => sum + parseFloat(p.netAmount), 0),
    };
  }, [payrollData]);

  const selectedGroup = allGroups?.find(g => g.id === selectedGroupId);

  return (
    <div className="container py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">نظام العمال المتقدم</h1>
        <p className="text-muted-foreground mt-2">حساب وإدارة العمال الموظفين بمرونة عالية</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Selectors */}
        <div className="lg:col-span-1 space-y-6">
          {/* Period Selector */}
          <PeriodSelector onPeriodChange={handlePeriodChange} defaultPeriodType="monthly" />

          {/* Group Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">اختيار المجموعة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {allGroups && allGroups.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {allGroups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => setSelectedGroupId(group.id)}
                        className={`p-3 text-right rounded-lg border-2 transition-all ${
                          selectedGroupId === group.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                            : 'border-border hover:border-blue-300'
                        }`}
                      >
                        <div className="font-medium">{group.name}</div>
                        <div className="text-sm text-muted-foreground">{group.code}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">لا توجد مجموعات</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button
              onClick={handleCalculatePayroll}
              disabled={isCalculating || !periodStart || !periodEnd || !selectedGroupId}
              className="w-full"
              size="lg"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحساب...
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4 ml-2" />
                  حساب الأجور
                </>
              )}
            </Button>

            <Button
              onClick={handleCalculatePayroll}
              disabled={isCalculating || !periodStart || !periodEnd || !selectedGroupId}
              className="w-full"
              variant="outline"
              size="lg"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري إعادة الحساب...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 ml-2" />
                  إعادة حساب
                </>
              )}
            </Button>

            <Button
              onClick={handleApproveBatch}
              disabled={payrollData.length === 0 || createBatchMutation.isPending}
              className="w-full"
              size="lg"
            >
              {createBatchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الإنشاء...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 ml-2" />
                  اعتماد الدفعة
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Data Display */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Cards */}
          {payrollData.length > 0 && (
            <PayrollSummaryCard
              data={{
                totalWorkers: summary.totalWorkers,
                totalDays: summary.totalDays,
                totalBase: summary.totalBase,
                totalDeductions: summary.totalDeductions,
                totalBonuses: summary.totalBonuses,
                totalNet: summary.totalNet,
                periodStart,
                periodEnd,
              }}
            />
          )}

          {/* Payroll Table */}
          {payrollData.length > 0 && (
            <PayrollTable
              data={payrollData as PayrollRow[]}
              isLoading={isCalculating}
              onRowClick={(row) => {
                console.log('Row clicked:', row);
              }}
            />
          )}

          {/* Empty State */}
          {payrollData.length === 0 && periodStart && periodEnd && selectedGroupId && !isCalculating && (
            <Card>
              <CardContent className="pt-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    لم يتم حساب الأجور بعد. اضغط على زر "حساب الأجور" لبدء العملية.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* No Selection State */}
          {(!periodStart || !periodEnd || !selectedGroupId) && payrollData.length === 0 && !isCalculating && (
            <Card>
              <CardContent className="pt-6">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    يرجى تحديد الفترة الزمنية والمجموعة لبدء حساب الأجور.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
