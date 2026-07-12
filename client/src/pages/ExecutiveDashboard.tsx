import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserX, 
  Clock, 
  DollarSign,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb
} from 'lucide-react';

export default function ExecutiveDashboard() {
  const { data, isLoading, refetch } = trpc.analytics.executive.useQuery(undefined, {
    refetchInterval: 60000 // Refresh every minute
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">لوحة التحكم التنفيذية</h1>
            <p className="text-muted-foreground">تحليل ذكي للأداء اليومي</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-20"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-16 mb-2"></div>
                <div className="h-3 bg-muted rounded w-24"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const { todayStats, yesterdayStats, weekAvg, healthScore, pressurePoint, anomaly, forecast, insight, pendingPayroll } = data;

  // Calculate trends
  const presentTrend = todayStats.present - yesterdayStats.present;
  const lateTrend = todayStats.late - yesterdayStats.late;
  const expenseTrend = todayStats.totalExpense - yesterdayStats.totalExpense;
  const presentVsWeek = todayStats.present - weekAvg;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم التنفيذية</h1>
          <p className="text-muted-foreground">تحليل ذكي للأداء اليومي</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-4xl">{healthScore.icon}</span>
          <div>
            <p className="text-sm text-muted-foreground">الحالة العامة</p>
            <p className="font-semibold">{healthScore.label}</p>
          </div>
        </div>
      </div>

      {/* Smart Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Attendance Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              الحضور اليومي
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayStats.present}</div>
            <div className="flex items-center gap-2 mt-2">
              {presentTrend > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : presentTrend < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : null}
              <span className={`text-sm ${presentTrend > 0 ? 'text-green-600' : presentTrend < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                {presentTrend > 0 ? '+' : ''}{presentTrend} عن الأمس
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              المتوسط الأسبوعي: {weekAvg} ({presentVsWeek > 0 ? '+' : ''}{presentVsWeek})
            </p>
          </CardContent>
        </Card>

        {/* Absence Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <UserX className="h-4 w-4" />
              الغياب
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayStats.absent}</div>
            <div className="mt-2">
              {todayStats.absent > weekAvg * 0.2 ? (
                <Badge variant="destructive" className="text-xs">
                  غير معتاد
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  طبيعي
                </Badge>
              )}
            </div>
            {pressurePoint && pressurePoint.type === 'group' && (
              <p className="text-xs text-muted-foreground mt-1">
                {pressurePoint.name}: {pressurePoint.reason}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Late Arrivals Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              التأخير
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayStats.late}</div>
            <div className="flex items-center gap-2 mt-2">
              {lateTrend > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-600" />
              ) : lateTrend < 0 ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : null}
              <span className={`text-sm ${lateTrend > 0 ? 'text-red-600' : lateTrend < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {lateTrend > 0 ? '+' : ''}{lateTrend} عن الأمس
              </span>
            </div>
            {todayStats.late > 5 && (
              <p className="text-xs text-amber-600 mt-1">
                تأخير أعلى من المعتاد
              </p>
            )}
          </CardContent>
        </Card>

        {/* Expense Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              المصروف اليومي
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayStats.totalExpense.toFixed(0)}</div>
            <div className="flex items-center gap-2 mt-2">
              {expenseTrend > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-600" />
              ) : expenseTrend < 0 ? (
                <TrendingDown className="h-4 w-4 text-green-600" />
              ) : null}
              <span className={`text-sm ${expenseTrend > 0 ? 'text-red-600' : expenseTrend < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {expenseTrend > 0 ? '+' : ''}{expenseTrend.toFixed(0)} ر.س
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(todayStats.totalExpense / (todayStats.present || 1)).toFixed(0)} ر.س للعامل
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Intelligence Layer */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Anomaly Detection */}
        {anomaly && anomaly.detected && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-5 w-5" />
                انحراف غير معتاد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-amber-900 font-medium">{anomaly.explanation}</p>
              <p className="text-xs text-amber-700 mt-2">
                المؤشر: {anomaly.metric} | الانحراف: {anomaly.deviation.toFixed(1)}×
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pressure Point */}
        {pressurePoint && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-900">
                <AlertTriangle className="h-5 w-5" />
                نقطة ضغط
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-900 font-medium">{pressurePoint.name}</p>
              <p className="text-sm text-red-700 mt-1">{pressurePoint.reason}</p>
            </CardContent>
          </Card>
        )}

        {/* Forecast */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Info className="h-5 w-5" />
              توقع نهاية اليوم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-blue-900 font-medium">{forecast.metric}</p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-blue-900">{forecast.predicted}</span>
              <span className="text-sm text-blue-700">
                (الحالي: {forecast.current})
              </span>
            </div>
            <p className="text-xs text-blue-700 mt-2">
              الثقة: {forecast.confidence === 'high' ? 'عالية' : forecast.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}
            </p>
          </CardContent>
        </Card>

        {/* Pending Payroll */}
        {pendingPayroll.length > 0 && (
          <Card className="border-purple-200 bg-purple-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <Wallet className="h-5 w-5" />
                دفعات بانتظار المراجعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">{pendingPayroll.length}</div>
              <p className="text-sm text-purple-700 mt-1">
                المجموع: {pendingPayroll.reduce((sum, b) => sum + b.amount, 0).toFixed(0)} ر.س
              </p>
              {pendingPayroll[0] && (
                <p className="text-xs text-purple-700 mt-2">
                  الأولوية: {pendingPayroll[0].code} ({pendingPayroll[0].daysWaiting} يوم)
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Insight + Action */}
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-900">
            <Lightbulb className="h-5 w-5" />
            التحليل الذكي
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">الاستنتاج</p>
              <p className="text-green-900 font-medium">{insight.insight}</p>
            </div>
            <div className="pt-3 border-t">
              <p className="text-sm text-muted-foreground">الإجراء المقترح</p>
              <div className="flex items-start gap-2 mt-1">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-green-900 font-medium">{insight.action}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
