import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Calendar, Clock, Save, AlertCircle, AlertTriangle, Info, History } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

const DAYS_OF_WEEK = [
  { id: 0, name: 'الأحد', nameEn: 'Sunday' },
  { id: 1, name: 'الإثنين', nameEn: 'Monday' },
  { id: 2, name: 'الثلاثاء', nameEn: 'Tuesday' },
  { id: 3, name: 'الأربعاء', nameEn: 'Wednesday' },
  { id: 4, name: 'الخميس', nameEn: 'Thursday' },
  { id: 5, name: 'الجمعة', nameEn: 'Friday' },
  { id: 6, name: 'السبت', nameEn: 'Saturday' },
];

interface DaySchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  requiredHours: number;
  isActive: boolean;
  dailyRate: string; // ✅ الراتب اليومي المخصص لهذا اليوم (فارغ = استخدام راتب المجموعة)
}

export default function WeeklyShifts() {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [applyOption, setApplyOption] = useState<'today' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [schedules, setSchedules] = useState<DaySchedule[]>(
    DAYS_OF_WEEK.map(day => ({
      dayOfWeek: day.id,
      startTime: '08:00',
      endTime: '16:00',
      requiredHours: 8,
      isActive: true,
      dailyRate: '', // فارغ = استخدام راتب المجموعة الافتراضي
    }))
  );
  const [showHistory, setShowHistory] = useState(false);

  const { data: groups, isLoading: loadingGroups } = trpc.groups.list.useQuery();
  const { data: existingSchedules, refetch: refetchSchedules } = trpc.groupSchedules.listByGroup.useQuery(
    { groupId: selectedGroupId! },
    { enabled: !!selectedGroupId }
  );

  // Get earliest safe date
  const { data: earliestSafeData } = (trpc.groupSchedules as any).getEarliestSafeDate.useQuery(
    { groupId: selectedGroupId! },
    { enabled: !!selectedGroupId && applyOption === 'custom' }
  );

  // Check date conflict
  const effectiveDate = applyOption === 'today' 
    ? new Date().toLocaleDateString('en-CA') 
    : customDate;

  const { data: conflictData } = (trpc.groupSchedules as any).checkDateConflict.useQuery(
    { groupId: selectedGroupId!, effectiveDate },
    { enabled: !!selectedGroupId && !!effectiveDate }
  );

  const saveSchedulesMutation = (trpc.groupSchedules as any).saveWeeklySchedules.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ الورديات الأسبوعية بنجاح');
      refetchSchedules();
    },
    onError: (error: any) => {
      toast.error(error.message || 'فشل حفظ الورديات');
    },
  });

  // Load existing schedules when group is selected
  useEffect(() => {
    if (existingSchedules && existingSchedules.length > 0) {
      const loadedSchedules = DAYS_OF_WEEK.map(day => {
        const existing = existingSchedules.find((s: any) => s.dayOfWeek === day.id);
        if (existing) {
          return {
            dayOfWeek: day.id,
            startTime: existing.startTime || '08:00',
            endTime: existing.endTime || '16:00',
            requiredHours: Number(existing.requiredHours) || 8,
            isActive: existing.isActive !== false,
            dailyRate: existing.dailyRate ? String(existing.dailyRate) : '',
          };
        }
        return {
          dayOfWeek: day.id,
          startTime: '08:00',
          endTime: '16:00',
          requiredHours: 8,
          isActive: true,
          dailyRate: '',
        };
      });
      setSchedules(loadedSchedules);
      
      // Check if there's an effective date in existing schedules
      const firstSchedule = existingSchedules[0];
      if (firstSchedule?.effectiveDate) {
        // Show history if there are versioned schedules
        setShowHistory(true);
      }
    }
  }, [existingSchedules]);

  const handleTimeChange = (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
    setSchedules(prev =>
      prev.map(s =>
        s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s
      )
    );
  };

  // ✅ تعديل الراتب اليومي المخصص ليوم معين
  const handleDailyRateChange = (dayOfWeek: number, value: string) => {
    setSchedules(prev =>
      prev.map(s =>
        s.dayOfWeek === dayOfWeek ? { ...s, dailyRate: value } : s
      )
    );
  };

  const handleActiveToggle = (dayOfWeek: number) => {
    setSchedules(prev =>
      prev.map(s =>
        s.dayOfWeek === dayOfWeek ? { ...s, isActive: !s.isActive } : s
      )
    );
  };

  const handleSaveAll = async () => {
    if (!selectedGroupId) {
      toast.error('الرجاء اختيار مجموعة أولاً');
      return;
    }

    // Check for conflict
    if (conflictData) {
      toast.error(
        `⛔ لا يمكن تطبيق الجدول من هذا التاريخ\n\nيوجد دفعة رواتب للفترة ${conflictData.periodStart} - ${conflictData.periodEnd} (حالة: ${conflictData.status}).\nلا يمكن تعديل الجدول لتواريخ داخل هذه الفترة.\n\nأقرب تاريخ متاح: ${earliestSafeData?.safeDate || 'غير محدد'}`,
        { duration: 8000 }
      );
      return;
    }

    await saveSchedulesMutation.mutateAsync({
      groupId: selectedGroupId,
      schedules: schedules.map(s => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        requiredHours: s.requiredHours,
        isActive: s.isActive,
        dailyRate: s.dailyRate || undefined, // ✅ إرسال الراتب اليومي إذا كان محدداً
      })),
      effectiveDate: effectiveDate || undefined,
    });
  };

  const calculateHours = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    let hours = endHour - startHour;
    let minutes = endMin - startMin;
    
    if (hours < 0) hours += 24; // Handle overnight shifts
    if (minutes < 0) {
      hours -= 1;
      minutes += 60;
    }
    
    return hours + minutes / 60;
  };

  // Group schedules by effective date for history
  const scheduleHistory = existingSchedules ? 
    existingSchedules.reduce((acc: any, schedule: any) => {
      const date = schedule.effectiveDate || 'current';
      if (!acc[date]) acc[date] = [];
      acc[date].push(schedule);
      return acc;
    }, {}) : {};

  const historyDates = Object.keys(scheduleHistory).sort().reverse();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">إدارة الورديات الأسبوعية</h1>
          <p className="text-muted-foreground mt-2">
            قم بتعيين أوقات وردية مختلفة لكل يوم من أيام الأسبوع
          </p>
        </div>
      </div>

      {/* Group Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            اختيار المجموعة
          </CardTitle>
          <CardDescription>
            اختر المجموعة التي تريد إدارة ورديات أيامها الأسبوعية
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>المجموعة</Label>
            <Select
              value={selectedGroupId?.toString() || ''}
              onValueChange={(value) => setSelectedGroupId(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر مجموعة" />
              </SelectTrigger>
              <SelectContent>
                {loadingGroups ? (
                  <SelectItem value="loading" disabled>
                    جاري التحميل...
                  </SelectItem>
                ) : (
                  groups?.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.nameAr || group.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Apply Date Options */}
      {selectedGroupId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                متى تريد تطبيق هذا الجدول الجديد؟
              </CardTitle>
              <CardDescription>
                ⚠️ تنبيه: أي تعديل سيؤثر على حساب الرواتب المستقبلية فقط
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={applyOption} onValueChange={(v: any) => setApplyOption(v)}>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="today" id="today" />
                  <Label htmlFor="today" className="cursor-pointer">
                    من اليوم ({new Date().toLocaleDateString('ar-SA')})
                  </Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="cursor-pointer">
                    من تاريخ محدد
                  </Label>
                </div>
              </RadioGroup>

              {applyOption === 'custom' && (
                <div className="space-y-2 mr-6">
                  <Label>التاريخ</Label>
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      يمكنك اختيار أي تاريخ في الماضي أو المستقبل. القيد الوحيد: لا يمكن التعديل على فترات تشملها دفعات رواتب موجودة.
                      {earliestSafeData && earliestSafeData.safeDate > new Date().toLocaleDateString('en-CA') && (
                        <span className="block mt-2 font-medium">
                          ℹ️ آخر دفعة رواتب: {new Date(earliestSafeData.safeDate).toLocaleDateString('ar-SA')}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {conflictData && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>⛔ لا يمكن تطبيق الجدول من هذا التاريخ</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">
                      يوجد دفعة رواتب للفترة {conflictData.periodStart} - {conflictData.periodEnd} (حالة: {conflictData.status}).
                    </p>
                    <p>
                      أقرب تاريخ متاح: <strong>{earliestSafeData?.safeDate || 'غير محدد'}</strong>
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {!conflictData && effectiveDate && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    ✅ سيتم تطبيق هذه الورديات ابتداءً من {new Date(effectiveDate).toLocaleDateString('ar-SA')}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Weekly Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                جدول الورديات الأسبوعي
              </CardTitle>
              <CardDescription>
                حدد أوقات البداية والنهاية لكل يوم من أيام الأسبوع
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {DAYS_OF_WEEK.map((day) => {
                  const schedule = schedules.find(s => s.dayOfWeek === day.id)!;
                  const calculatedHours = calculateHours(schedule.startTime, schedule.endTime);

                  return (
                    <div
                      key={day.id}
                      className={`p-4 border rounded-lg ${
                        schedule.isActive ? 'bg-background' : 'bg-muted/50'
                      }`}
                    >
                      <div className="grid gap-4 md:grid-cols-6 items-end">
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">{day.name}</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={schedule.isActive}
                              onChange={() => handleActiveToggle(day.id)}
                              className="h-4 w-4"
                            />
                            <span className="text-sm text-muted-foreground">
                              {schedule.isActive ? 'فعّال' : 'معطّل'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>وقت البداية</Label>
                          <Input
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) => handleTimeChange(day.id, 'startTime', e.target.value)}
                            disabled={!schedule.isActive}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>وقت النهاية</Label>
                          <Input
                            type="time"
                            value={schedule.endTime}
                            onChange={(e) => handleTimeChange(day.id, 'endTime', e.target.value)}
                            disabled={!schedule.isActive}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>عدد الساعات</Label>
                          <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                            <span className="text-sm font-medium">
                              {calculatedHours.toFixed(1)} ساعة
                            </span>
                          </div>
                        </div>

                        {/* ✅ حقل الراتب اليومي المخصص لهذا اليوم */}
                        <div className="space-y-2">
                          <Label>الراتب اليومي (ريال)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="افتراضي"
                            value={schedule.dailyRate}
                            onChange={(e) => handleDailyRateChange(day.id, e.target.value)}
                            disabled={!schedule.isActive}
                            className={schedule.dailyRate ? 'border-green-500' : ''}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="opacity-0">الإجراءات</Label>
                          <Badge variant={schedule.isActive ? "default" : "secondary"}>
                            {schedule.isActive ? '✓ نشط' : '✕ معطل'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-6">
                <Button
                  onClick={handleSaveAll}
                  disabled={saveSchedulesMutation.isPending || !selectedGroupId || !!conflictData}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 ml-2" />
                  {saveSchedulesMutation.isPending ? 'جاري الحفظ...' : 'حفظ جميع التغييرات'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowHistory(!showHistory)}
                  disabled={historyDates.length === 0}
                >
                  <History className="h-4 w-4 ml-2" />
                  {showHistory ? 'إخفاء السجل' : 'عرض السجل'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Schedule History */}
          {showHistory && historyDates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  سجل التغييرات
                </CardTitle>
                <CardDescription>
                  عرض الجداول السابقة والحالية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {historyDates.map((date, index) => {
                    const schedules = scheduleHistory[date];
                    const isCurrent = index === 0;
                    
                    return (
                      <div key={date} className={`p-4 border rounded-lg ${isCurrent ? 'border-primary bg-primary/5' : ''}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">
                              {date === 'current' ? 'الجدول الحالي' : `جدول من ${new Date(date).toLocaleDateString('ar-SA')}`}
                            </h3>
                            {isCurrent && <Badge>الحالي</Badge>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          {DAYS_OF_WEEK.map(day => {
                            const schedule = schedules.find((s: any) => s.dayOfWeek === day.id);
                            if (!schedule || !schedule.isActive) return null;
                            
                            return (
                              <div key={day.id} className="flex items-center gap-2">
                                <span className="font-medium">{day.name}:</span>
                                <span className="text-muted-foreground">
                                  {schedule.startTime} - {schedule.endTime}
                                  {schedule.dailyRate ? ` (راتب: ${schedule.dailyRate} ريال)` : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
