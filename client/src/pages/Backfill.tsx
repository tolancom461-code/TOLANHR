import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Database } from 'lucide-react';

export default function Backfill() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; processed?: number } | null>(null);
  
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.system.dataStats.useQuery();

  const backfillMutation = trpc.system.backfillDailyFinance.useMutation({
    onSuccess: (data) => {
      setResult({
        success: true,
        message: 'تمت معالجة البيانات التاريخية بنجاح!',
        processed: data.processed
      });
      setIsProcessing(false);
      refetchStats();
    },
    onError: (error) => {
      setResult({
        success: false,
        message: `حدث خطأ: ${error.message}`
      });
      setIsProcessing(false);
    }
  });

  const handleBackfill = async () => {
    setIsProcessing(true);
    setResult(null);
    backfillMutation.mutate();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Database className="h-8 w-8 text-blue-600" />
            <div>
              <CardTitle className="text-2xl">معالجة البيانات التاريخية</CardTitle>
              <CardDescription className="mt-2">
                هذه الأداة تقوم بمعالجة بيانات الحضور والانصراف التاريخية وحساب الرواتب اليومية للعمال
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Statistics */}
          {statsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">العمال</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.workers.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">سجلات الحضور</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.attendance.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    دخول: {stats.attendance.checkIns} | خروج: {stats.attendance.checkOuts}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">السجلات المالية</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.finance.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.attendance.checkOuts > 0 && stats.finance.total === 0 && (
                      <span className="text-red-600">⚠️ يوجد {stats.attendance.checkOuts} check_out بدون حساب مالي!</span>
                    )}
                    {stats.finance.total > 0 && stats.attendance.checkOuts === stats.finance.total && (
                      <span className="text-green-600">✓ جميع السجلات محسوبة</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Explanation */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>متى تحتاج لاستخدام هذه الأداة؟</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>إذا كان لديك بيانات حضور وانصراف قديمة لم يتم حساب رواتبها</li>
                <li>إذا كان جدول worker_daily_finance فارغاً رغم وجود بيانات حضور</li>
                <li>إذا أردت إعادة حساب الرواتب اليومية لفترة سابقة</li>
              </ul>
            </AlertDescription>
          </Alert>

          {/* Warning */}
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>تحذير</AlertTitle>
            <AlertDescription>
              هذه العملية ستقوم بمعالجة جميع سجلات الحضور والانصراف (check_out) التي لم يتم حساب رواتبها بعد.
              قد تستغرق العملية بعض الوقت حسب حجم البيانات.
            </AlertDescription>
          </Alert>

          {/* Action Button */}
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleBackfill}
              disabled={isProcessing}
              size="lg"
              className="w-full max-w-md"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-5 w-5" />
                  بدء معالجة البيانات التاريخية
                </>
              )}
            </Button>
          </div>

          {/* Result */}
          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'} className="mt-6">
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>{result.success ? 'نجح!' : 'خطأ'}</AlertTitle>
              <AlertDescription>
                {result.message}
                {result.processed !== undefined && (
                  <div className="mt-2 font-semibold">
                    عدد السجلات المعالجة: {result.processed}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Info */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">كيف تعمل هذه الأداة؟</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>تبحث عن جميع سجلات check_out في جدول attendance_events</li>
              <li>تتحقق من كل سجل إذا كان له حساب مالي في worker_daily_finance</li>
              <li>إذا لم يكن موجوداً، تقوم بحساب الراتب اليومي تلقائياً</li>
              <li>تطبق قواعد الورديات والخصومات والغرامات</li>
              <li>تحفظ النتيجة في جدول worker_daily_finance</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
