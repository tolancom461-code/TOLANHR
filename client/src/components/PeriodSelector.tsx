import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'custom';

interface PeriodSelectorProps {
  onPeriodChange: (startDate: string, endDate: string, periodType: PeriodType) => void;
  defaultPeriodType?: PeriodType;
}

export function PeriodSelector({ onPeriodChange, defaultPeriodType = 'monthly' }: PeriodSelectorProps) {
  const [periodType, setPeriodType] = useState<PeriodType>(defaultPeriodType);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDate = today.getDate();

  // Calculate period dates based on type
  const calculatedPeriod = useMemo(() => {
    const start = new Date();
    const end = new Date();

    switch (periodType) {
      case 'daily':
        // Today
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;

      case 'weekly':
        // Current week (Monday to Sunday)
        const dayOfWeek = start.getDay();
        const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;

      case 'monthly':
        // Current month
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;

      case 'custom':
        if (customStartDate && customEndDate) {
          start.setTime(new Date(customStartDate).getTime());
          end.setTime(new Date(customEndDate).getTime());
        }
        break;
    }

    return {
      start: start.toLocaleDateString('en-CA'),
      end: end.toLocaleDateString('en-CA'),
    };
  }, [periodType, customStartDate, customEndDate]);

  const handleApply = () => {
    onPeriodChange(calculatedPeriod.start, calculatedPeriod.end, periodType);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>اختيار الفترة الزمنية</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period Type Selector */}
        <div className="space-y-2">
          <Label htmlFor="period-type">نوع الفترة</Label>
          <Select value={periodType} onValueChange={(value) => setPeriodType(value as PeriodType)}>
            <SelectTrigger id="period-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">يومي</SelectItem>
              <SelectItem value="weekly">أسبوعي</SelectItem>
              <SelectItem value="monthly">شهري</SelectItem>
              <SelectItem value="custom">مخصص</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Custom Date Range */}
        {periodType === 'custom' && (
          <div className="space-y-4 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="start-date">تاريخ البدء</Label>
              <Input
                id="start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">تاريخ الانتهاء</Label>
              <Input
                id="end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Period Preview */}
        <div className="bg-muted p-3 rounded-lg space-y-1">
          <div className="text-sm">
            <span className="font-medium">من:</span> {new Date(calculatedPeriod.start).toLocaleDateString('ar-SA')}
          </div>
          <div className="text-sm">
            <span className="font-medium">إلى:</span> {new Date(calculatedPeriod.end).toLocaleDateString('ar-SA')}
          </div>
          <div className="text-xs text-muted-foreground pt-2">
            {(() => {
              const start = new Date(calculatedPeriod.start);
              const end = new Date(calculatedPeriod.end);
              const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              return `${days} يوم`;
            })()}
          </div>
        </div>

        {/* Apply Button */}
        <Button
          onClick={handleApply}
          className="w-full"
          disabled={periodType === 'custom' && (!customStartDate || !customEndDate)}
        >
          تطبيق الفترة
        </Button>
      </CardContent>
    </Card>
  );
}
