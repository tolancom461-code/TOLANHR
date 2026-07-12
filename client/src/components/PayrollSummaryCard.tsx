import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Users, Calendar, TrendingUp, TrendingDown } from 'lucide-react';

interface PayrollSummaryData {
  totalWorkers: number;
  totalDays: number;
  totalBase: number;
  totalDeductions: number;
  totalBonuses: number;
  totalNet: number;
  periodStart: string;
  periodEnd: string;
}

export function PayrollSummaryCard({ data }: { data: PayrollSummaryData }) {
  const deductionPercentage = data.totalBase > 0 
    ? ((data.totalDeductions / data.totalBase) * 100).toFixed(1)
    : '0';

  const bonusPercentage = data.totalBase > 0
    ? ((data.totalBonuses / data.totalBase) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4">
      {/* Main Summary */}
      <Card className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
        <CardHeader>
          <CardTitle className="text-2xl text-blue-900 dark:text-blue-100">
            ملخص دفعة الرواتب
          </CardTitle>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
            من {new Date(data.periodStart).toLocaleDateString('ar-SA')} إلى{' '}
            {new Date(data.periodEnd).toLocaleDateString('ar-SA')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Total Workers */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-muted-foreground">عدد العمال</span>
              </div>
              <div className="text-2xl font-bold">{data.totalWorkers}</div>
            </div>

            {/* Total Days */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">إجمالي الأيام</span>
              </div>
              <div className="text-2xl font-bold">{data.totalDays}</div>
            </div>

            {/* Net Amount */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg md:col-span-1 col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium text-muted-foreground">الصافي الإجمالي</span>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {data.totalNet.toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Amount */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الأجور الأساسية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {data.totalBase.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              متوسط العامل: {(data.totalBase / Math.max(data.totalWorkers, 1)).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {/* Deductions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              الخصومات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {data.totalDeductions.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {deductionPercentage}% من الأجور الأساسية
            </p>
          </CardContent>
        </Card>

        {/* Bonuses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              المكافآت والإضافات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {data.totalBonuses.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {bonusPercentage}% من الأجور الأساسية
            </p>
          </CardContent>
        </Card>

        {/* Net Calculation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الحساب النهائي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">الأساسي</span>
              <span className="font-medium">+{data.totalBase.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">الخصومات</span>
              <span className="font-medium text-red-600">-{data.totalDeductions.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">المكافآت</span>
              <span className="font-medium text-green-600">+{data.totalBonuses.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="font-semibold">الصافي</span>
              <span className="text-lg font-bold text-purple-600">
                {data.totalNet.toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Average Per Worker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">المتوسطات لكل عامل</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">متوسط الأيام</div>
              <div className="text-2xl font-bold">
                {(data.totalDays / Math.max(data.totalWorkers, 1)).toFixed(1)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">متوسط الأساسي</div>
              <div className="text-2xl font-bold">
                {(data.totalBase / Math.max(data.totalWorkers, 1)).toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">متوسط الخصومات</div>
              <div className="text-2xl font-bold text-red-600">
                {(data.totalDeductions / Math.max(data.totalWorkers, 1)).toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">متوسط الصافي</div>
              <div className="text-2xl font-bold text-purple-600">
                {(data.totalNet / Math.max(data.totalWorkers, 1)).toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
