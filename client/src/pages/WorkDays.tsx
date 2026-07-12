import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Calendar,
  RefreshCw,
  Sun,
  Moon,
  Briefcase,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { toast } from 'sonner';

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

type DayType = 'normal' | 'holiday' | 'weekend';

interface WorkDay {
  id?: number;
  workDate: string;
  dayType: DayType;
  notes?: string | null;
}

export default function WorkDays() {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [editingDay, setEditingDay] = useState<{ date: string; dayType: DayType; notes: string } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  const { data: workDays, refetch } = trpc.workDays.list.useQuery({
    year: selectedYear,
    month: selectedMonth
  });
  
  const upsertMutation = trpc.workDays.upsert.useMutation({
    onSuccess: () => {
      toast.success('تم حفظ التغييرات');
      refetch();
      setShowEditDialog(false);
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ');
    }
  });

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i + 2);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: { date: string; dayNum: number; isCurrentMonth: boolean; dayOfWeek: number }[] = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(selectedYear, selectedMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const date = new Date(selectedYear, selectedMonth - 2, dayNum);
      days.push({
        date: date.toLocaleDateString('en-CA'),
        dayNum,
        isCurrentMonth: false,
        dayOfWeek: date.getDay()
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(selectedYear, selectedMonth - 1, i);
      days.push({
        date: date.toLocaleDateString('en-CA'),
        dayNum: i,
        isCurrentMonth: true,
        dayOfWeek: date.getDay()
      });
    }
    
    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(selectedYear, selectedMonth, i);
      days.push({
        date: date.toLocaleDateString('en-CA'),
        dayNum: i,
        isCurrentMonth: false,
        dayOfWeek: date.getDay()
      });
    }
    
    return days;
  }, [selectedYear, selectedMonth]);

  const workDaysMap = useMemo(() => {
    const map: Record<string, WorkDay> = {};
    workDays?.forEach((wd: any) => {
      map[wd.workDate] = wd;
    });
    return map;
  }, [workDays]);

  const getDayType = (date: string, dayOfWeek: number): DayType => {
    if (workDaysMap[date]) {
      return workDaysMap[date].dayType as DayType;
    }
    // Default: Friday and Saturday are weekends
    if (dayOfWeek === 5 || dayOfWeek === 6) {
      return 'weekend';
    }
    return 'normal';
  };

  const getDayStyle = (dayType: DayType) => {
    switch (dayType) {
      case 'holiday':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300';
      case 'weekend':
        return 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300';
      default:
        return 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300';
    }
  };

  const handleDayClick = (date: string, dayOfWeek: number) => {
    const existingDay = workDaysMap[date];
    setEditingDay({
      date,
      dayType: existingDay?.dayType as DayType || getDayType(date, dayOfWeek),
      notes: existingDay?.notes || ''
    });
    setShowEditDialog(true);
  };

  const handleSaveDay = () => {
    if (!editingDay) return;
    upsertMutation.mutate({
      workDate: editingDay.date,
      dayType: editingDay.dayType,
      notes: editingDay.notes || undefined
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedMonth === 1) {
        setSelectedMonth(12);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 12) {
        setSelectedMonth(1);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            إدارة أيام العمل
          </h1>
          <p className="text-muted-foreground">
            تحديد العطلات وأيام العمل
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={index} value={(index + 1).toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/20 border border-green-300"></div>
          <span className="text-sm">يوم عمل</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300"></div>
          <span className="text-sm">عطلة نهاية الأسبوع</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-100 dark:bg-red-900/30 border border-red-300"></div>
          <span className="text-sm">عطلة رسمية</span>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl">
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </CardTitle>
          <CardDescription className="text-center">
            اضغط على أي يوم لتعديل نوعه
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {/* Weekday headers */}
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center font-semibold p-2 text-sm text-muted-foreground">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              const dayType = getDayType(day.date, day.dayOfWeek);
              const dayNotes = workDaysMap[day.date]?.notes;
              
              return (
                <button
                  key={index}
                  onClick={() => day.isCurrentMonth && handleDayClick(day.date, day.dayOfWeek)}
                  disabled={!day.isCurrentMonth}
                  className={`
                    relative p-2 min-h-[60px] rounded-lg border transition-all
                    ${day.isCurrentMonth ? getDayStyle(dayType) : 'bg-transparent text-gray-300 dark:text-gray-700 border-transparent'}
                    ${day.isCurrentMonth ? 'hover:ring-2 hover:ring-primary cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <span className="text-lg font-medium">{day.dayNum}</span>
                  {dayNotes && day.isCurrentMonth && (
                    <div className="absolute bottom-1 left-1 right-1 text-[10px] truncate text-muted-foreground">
                      {dayNotes}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل يوم {editingDay?.date}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>نوع اليوم</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={editingDay?.dayType === 'normal' ? 'default' : 'outline'}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setEditingDay(prev => prev ? { ...prev, dayType: 'normal' } : null)}
                >
                  <Briefcase className="h-5 w-5" />
                  <span className="text-xs">يوم عمل</span>
                </Button>
                <Button
                  variant={editingDay?.dayType === 'weekend' ? 'default' : 'outline'}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setEditingDay(prev => prev ? { ...prev, dayType: 'weekend' } : null)}
                >
                  <Moon className="h-5 w-5" />
                  <span className="text-xs">عطلة أسبوعية</span>
                </Button>
                <Button
                  variant={editingDay?.dayType === 'holiday' ? 'default' : 'outline'}
                  className="flex flex-col items-center gap-1 h-auto py-3"
                  onClick={() => setEditingDay(prev => prev ? { ...prev, dayType: 'holiday' } : null)}
                >
                  <Sun className="h-5 w-5" />
                  <span className="text-xs">عطلة رسمية</span>
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Input
                id="notes"
                placeholder="مثال: عيد الفطر"
                value={editingDay?.notes || ''}
                onChange={(e) => setEditingDay(prev => prev ? { ...prev, notes: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveDay} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
