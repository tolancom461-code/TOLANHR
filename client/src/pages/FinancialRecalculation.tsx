import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertCircle, CheckCircle2, Loader2, ArrowRight } from "lucide-react";

export default function FinancialRecalculation() {
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [costCenterId, setCostCenterId] = useState<number | undefined>(undefined);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch groups and cost centers for dropdowns
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: costCenters } = trpc.costCenters.list.useQuery();

  const recalculateMutation = trpc.financialRecalculation.recalculateRange.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setIsProcessing(false);
      setError(null);
    },
    onError: (error) => {
      setError(error.message);
      setIsProcessing(false);
      setResult(null);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate || !endDate) {
      setError("يرجى تحديد تاريخ البداية والنهاية");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("تاريخ البداية يجب أن يكون قبل تاريخ النهاية");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    recalculateMutation.mutate({
      startDate,
      endDate,
      groupId,
      costCenterId,
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/dashboard")}
          className="mb-4"
        >
          ← العودة إلى لوحة التحكم
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">إعادة مزامنة البيانات المالية</h1>
        <p className="text-muted-foreground">
          إعادة حساب السجلات المالية لجميع العمال في نطاق زمني محدد
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>إعدادات إعادة الحساب</CardTitle>
          <CardDescription>
            حدد النطاق الزمني والفلاتر لإعادة حساب السجلات المالية
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">تاريخ البداية *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  disabled={isProcessing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">تاريخ النهاية *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  disabled={isProcessing}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupId">المجموعة (اختياري)</Label>
              <Select
                value={groupId?.toString() || "all"}
                onValueChange={(value) => setGroupId(value === "all" ? undefined : parseInt(value))}
                disabled={isProcessing}
              >
                <SelectTrigger id="groupId">
                  <SelectValue placeholder="جميع المجموعات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="costCenterId">مركز التكلفة (اختياري)</Label>
              <Select
                value={costCenterId?.toString() || "all"}
                onValueChange={(value) => setCostCenterId(value === "all" ? undefined : parseInt(value))}
                disabled={isProcessing}
              >
                <SelectTrigger id="costCenterId">
                  <SelectValue placeholder="جميع مراكز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع مراكز التكلفة</SelectItem>
                  {costCenters?.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id.toString()}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>تنبيه:</strong> هذه العملية ستعيد حساب جميع السجلات المالية في النطاق الزمني المحدد بناءً على الإعدادات الحالية. 
                تأكد من صحة الإعدادات قبل المتابعة.
              </AlertDescription>
            </Alert>

            <Button
              type="submit"
              className="w-full"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري المعالجة...
                </>
              ) : (
                <>
                  إعادة الحساب
                  <ArrowRight className="mr-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle>جاري المعالجة...</CardTitle>
            <CardDescription>
              يرجى الانتظار حتى تكتمل عملية إعادة الحساب
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={undefined} className="w-full" />
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <CheckCircle2 className="ml-2 h-5 w-5" />
              تمت العملية بنجاح
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">عدد العمال المعالجين</p>
                <p className="text-2xl font-bold">{result.workersProcessed}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">عدد الأيام المعالجة</p>
                <p className="text-2xl font-bold">{result.daysProcessed}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">إجمالي السجلات المحدثة</p>
                <p className="text-2xl font-bold">{result.recordsUpdated}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">مدة العملية</p>
                <p className="text-2xl font-bold">{(result.duration / 1000).toFixed(2)} ثانية</p>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <Alert className="bg-yellow-50 border-yellow-200">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  <strong>تحذير:</strong> حدثت بعض الأخطاء أثناء المعالجة ({result.errors.length} خطأ):
                  <ul className="list-disc list-inside mt-2 text-sm">
                    {result.errors.slice(0, 5).map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>... و {result.errors.length - 5} خطأ آخر</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
