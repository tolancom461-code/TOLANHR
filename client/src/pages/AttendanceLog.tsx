import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  ArrowRightCircle, 
  ArrowLeftCircle,
  RefreshCw,
  Users,
  Calendar,
  Edit,
  Lock,
  AlertCircle,
  Download,
  Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AttendanceLog() {
  const { user } = useAuth();
  // المراجع والمدير المالي: استعراض فقط بدون تعديل
  const canEditAttendance = user?.role !== 'auditor' && user?.role !== 'finance_manager';
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editingSessions, setEditingSessions] = useState<Array<{
    checkInId: number | null;
    checkOutId: number | null;
    checkInTime: string;
    checkOutTime: string;
  }>>([]);
  const [editNote, setEditNote] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{eventId: number, eventType: 'checkIn' | 'checkOut'} | null>(null);
  const [isAbsentDialogOpen, setIsAbsentDialogOpen] = useState(false);
  const [isPrepareDialogOpen, setIsPrepareDialogOpen] = useState(false);
  const [selectedAbsentWorker, setSelectedAbsentWorker] = useState<any>(null);
  const [prepareCheckInTime, setPrepareCheckInTime] = useState('');
  const [prepareCheckOutTime, setPrepareCheckOutTime] = useState('');
  const [prepareNote, setPrepareNote] = useState('');
  const [absentFilterGroup, setAbsentFilterGroup] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedGroup, selectedDate]);
  
  // Check if selected date is locked
  const { data: dateLockStatus } = trpc.attendance.checkDateLocked.useQuery(
    { date: selectedDate },
    { enabled: !!selectedDate }
  );

  const { data: allGroups } = trpc.groups.list.useQuery();
  
  const groups = allGroups;
  const { data: todayLogData, isLoading, refetch } = trpc.attendance.todayLogWithPagination.useQuery({
    groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined,
    date: selectedDate,
    page: currentPage,
    limit: pageSize
  });
  
  const todayLog = todayLogData?.data || [];
  const totalPages = todayLogData?.totalPages || 1;
  const total = todayLogData?.total || 0;
  const { data: stats } = trpc.attendance.stats.useQuery({
    groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined,
    date: selectedDate
  });

  // Get absent workers
  const { data: absentWorkers, refetch: refetchAbsent } = trpc.attendance.getAbsentWorkers.useQuery({
    workDateStr: selectedDate,
    groupId: absentFilterGroup !== 'all' ? parseInt(absentFilterGroup) : undefined
  });

  // Mutations for manual attendance
  const addCheckInMutation = trpc.attendance.addMissingCheckIn.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة الحضور بنجاح');
      refetchAbsent();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة الحضور');
    }
  });

  const addCheckOutMutation = trpc.attendance.addMissingCheckOut.useMutation({
    onSuccess: () => {
      toast.success('تم إضافة الانصراف بنجاح');
      setIsPrepareDialogOpen(false);
      setIsAbsentDialogOpen(false);
      refetchAbsent();
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل إضافة الانصراف');
    }
  });

  const exportMutation = trpc.attendance.exportToExcel.useMutation({
    onSuccess: (result) => {
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('تم تصدير سجل الحضور بنجاح');
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تصدير سجل الحضور');
    }
  });

  const updateEventMutation = trpc.attendance.updateEvent.useMutation({
    onSuccess: () => {
      toast.success('تم تعديل سجل الحضور بنجاح');
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تعديل سجل الحضور');
    }
  });

  const deletePunchMutation = trpc.attendance.deletePunchEvent.useMutation({
    onSuccess: () => {
      toast.success('تم حذف سجل الحضور بنجاح');
      setIsDeleteConfirmOpen(false);
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل حذف سجل الحضور');
    }
  });

  const handleEditClick = (record: any) => {
    setEditingRecord(record);

    const sessions = record.sessions && record.sessions.length > 0
      ? record.sessions
      : [{
          checkIn: record.checkInTime ? { id: record.checkInId, eventTime: record.checkInTime } : null,
          checkOut: record.checkOutTime ? { id: record.checkOutId, eventTime: record.checkOutTime } : null
        }];

    const builtSessions = sessions.map((s: any) => {
      const formatT = (t: any) => {
        if (!t) return '';
        const d = new Date(t);
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      };
      return {
        checkInId: s.checkIn?.id || null,
        checkOutId: s.checkOut?.id || null,
        checkInTime: formatT(s.checkIn?.eventTime),
        checkOutTime: formatT(s.checkOut?.eventTime),
      };
    });

    setEditingSessions(builtSessions);
    setEditNote('');
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (eventId: number, eventType: 'checkIn' | 'checkOut') => {
    setDeleteTarget({ eventId, eventType });
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deletePunchMutation.mutate({
      eventId: deleteTarget.eventId,
      reason: editNote || 'حذف سجل حضور تم بالخطأ'
    });
  };

  // ✅ يعدل كل الجلسات
  const handleSaveEdit = () => {
    if (!editingRecord || editingSessions.length === 0) return;

    const baseDate = new Date(selectedDate);
    baseDate.setHours(0, 0, 0, 0);

    for (const session of editingSessions) {
      if (session.checkInTime && session.checkInId) {
        const [h, m] = session.checkInTime.split(':');
        const newTime = new Date(baseDate);
        newTime.setHours(parseInt(h), parseInt(m), 0, 0);
        updateEventMutation.mutate({
          eventId: session.checkInId,
          newTime: newTime.toISOString(),
          internalNote: editNote
        });
      }

      if (session.checkOutTime && session.checkOutId) {
        const [h, m] = session.checkOutTime.split(':');
        const newTime = new Date(baseDate);
        newTime.setHours(parseInt(h), parseInt(m), 0, 0);

        if (session.checkInTime) {
          const [ih, im] = session.checkInTime.split(':');
          const inRef = new Date(baseDate);
          inRef.setHours(parseInt(ih), parseInt(im), 0, 0);
          if (newTime <= inRef) newTime.setDate(newTime.getDate() + 1);
        }

        updateEventMutation.mutate({
          eventId: session.checkOutId,
          newTime: newTime.toISOString(),
          internalNote: editNote
        });
      }
    }
  };

  const handlePrepareWorker = (worker: any) => {
    setSelectedAbsentWorker(worker);
    setPrepareCheckInTime('');
    setPrepareCheckOutTime('');
    setPrepareNote('');
    setIsPrepareDialogOpen(true);
  };

  const handleSavePrepare = async () => {
    if (!selectedAbsentWorker || !prepareCheckInTime || !prepareCheckOutTime) {
      toast.error('يجب إدخال وقت الحضور والانصراف');
      return;
    }

    try {
      const baseDate = new Date(selectedDate);
      baseDate.setHours(0, 0, 0, 0);

      const [checkInHours, checkInMinutes] = prepareCheckInTime.split(':');
      const checkInTime = new Date(baseDate);
      checkInTime.setHours(parseInt(checkInHours), parseInt(checkInMinutes), 0, 0);
      await addCheckInMutation.mutateAsync({
        workerId: selectedAbsentWorker.workerId,
        checkInTime: checkInTime.toISOString(),
        note: prepareNote || 'تحضير يدوي'
      });

      const [checkOutHours, checkOutMinutes] = prepareCheckOutTime.split(':');
      const checkOutTime = new Date(baseDate);
      checkOutTime.setHours(parseInt(checkOutHours), parseInt(checkOutMinutes), 0, 0);
      
      if (checkOutTime <= checkInTime) {
        checkOutTime.setDate(checkOutTime.getDate() + 1);
      }
      await addCheckOutMutation.mutateAsync({
        workerId: selectedAbsentWorker.workerId,
        checkOutTime: checkOutTime.toISOString(),
        note: prepareNote || 'تحضير يدوي'
      });

      toast.success('تم إضافة الحضور والانصراف بنجاح');
      setIsPrepareDialogOpen(false);
      setIsAbsentDialogOpen(false);
    } catch (error: any) {
      console.error('Error in handleSavePrepare:', error);
      toast.error(error.message || 'فشل إضافة الحضور');
    }
  };

  const formatTime = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleTimeString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMethodBadge = (method: string | null) => {
    if (!method) return null;
    switch (method) {
      case 'qr':
        return <Badge variant="outline">QR</Badge>;
      case 'manual':
        return <Badge variant="secondary">يدوي</Badge>;
      case 'biometric':
        return <Badge variant="default">بصمة</Badge>;
      default:
        return <Badge variant="outline">{method}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            سجل الحضور اليومي
          </h1>
          <p className="text-muted-foreground">
            {new Date(selectedDate).toLocaleDateString('ar-SA', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-48"
            />
            {dateLockStatus?.isLocked && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                مغلق
              </Badge>
            )}
          </div>
          <Select value={selectedGroup} onValueChange={setSelectedGroup}>
            <SelectTrigger className="w-48">
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
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant="default" 
            onClick={() => exportMutation.mutate({ 
              date: selectedDate, 
              groupId: selectedGroup !== 'all' ? parseInt(selectedGroup) : undefined 
            })}
            disabled={exportMutation.isPending || !todayLog?.length}
          >
            <Download className="h-4 w-4 ml-2" />
            تصدير Excel
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      {dateLockStatus?.isLocked ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <Lock className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">التاريخ مغلق للتعديل</p>
            <p className="text-sm text-red-700 mt-1">
              لا يمكن تعديل سجلات الحضور لهذا التاريخ لأنه يتضمن دفعة راتب معتمدة ({dateLockStatus.batch?.batchCode}). 
              يجب حذف المسودة أولاً للتمكن من التعديل.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">ملاحظة هامة</p>
            <p className="text-sm text-blue-700 mt-1">
              يمكنك تعديل سجلات الحضور لأي يوم طالما لم يتم إنشاء دفعة راتب له. إذا كان هناك دفعة راتب معتمدة، يجب حذف المسودة أولاً.
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalWorkers || 0}</p>
                <p className="text-sm text-muted-foreground">إجمالي العمال</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <ArrowRightCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.presentToday || 0}</p>
                <p className="text-sm text-muted-foreground">حاضرون</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => {
            setAbsentFilterGroup(selectedGroup);
            setIsAbsentDialogOpen(true);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <ArrowLeftCircle className="h-5 w-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-bold">{stats?.absentToday || 0}</p>
                <p className="text-sm text-muted-foreground">غائبون</p>
              </div>
              <ArrowLeftCircle className="h-5 w-5 text-red-600 transform rotate-180" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayLog?.length || 0}</p>
                <p className="text-sm text-muted-foreground">عدد العمال</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجل اليوم</CardTitle>
          <CardDescription>جميع تسجيلات الحضور والانصراف لهذا اليوم</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !todayLog?.length ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
              <p className="mt-2 text-muted-foreground">لا توجد تسجيلات اليوم</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم العامل</TableHead>
                    <TableHead className="text-right">الرمز</TableHead>
                    <TableHead className="text-right">وقت الحضور</TableHead>
                    <TableHead className="text-right">طريقة الحضور</TableHead>
                    <TableHead className="text-right">وقت الانصراف</TableHead>
                    <TableHead className="text-right">طريقة الانصراف</TableHead>
                    <TableHead className="text-right">دقائق العمل</TableHead>
                    <TableHead className="text-right">ساعات العمل</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayLog.map((record: any) => {
                    // ✅ عرض كل الجلسات — لو عنده جلسات متعددة نعرضها كلها
                    const sessions = record.sessions && record.sessions.length > 0
                      ? record.sessions
                      : [{
                          checkIn: record.checkInTime ? {
                            id: record.checkInId,
                            eventTime: record.checkInTime,
                            method: record.checkInMethod
                          } : null,
                          checkOut: record.checkOutTime ? {
                            id: record.checkOutId,
                            eventTime: record.checkOutTime,
                            method: record.checkOutMethod
                          } : null
                        }];

                    return sessions.map((session: any, sessionIndex: number) => (
                      <TableRow
                        key={`${record.workerId}-${sessionIndex}`}
                        className={sessionIndex > 0 ? "bg-blue-50/30" : ""}
                      >
                        <TableCell className="font-medium">
                          {sessionIndex === 0 ? record.workerName : (
                            <span className="text-muted-foreground text-sm pr-4">
                              ↳ جلسة {sessionIndex + 1}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {sessionIndex === 0 ? record.workerCode : ""}
                        </TableCell>
                        <TableCell className="font-mono">
                          {session.checkIn?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <ArrowRightCircle className="h-4 w-4 text-green-600" />
                              {formatTime(session.checkIn.eventTime)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getMethodBadge(session.checkIn?.method)}
                        </TableCell>
                        <TableCell className="font-mono">
                          {session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <ArrowLeftCircle className="h-4 w-4 text-orange-600" />
                              {formatTime(session.checkOut.eventTime)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getMethodBadge(session.checkOut?.method)}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {session.checkIn?.eventTime && session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              {(() => {
                                let mins = Math.round((new Date(session.checkOut.eventTime).getTime() - new Date(session.checkIn.eventTime).getTime()) / 60000);
                                if (mins < 0) mins += 1440;
                                return mins;
                              })()} دقيقة
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {session.checkIn?.eventTime && session.checkOut?.eventTime ? (
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-600" />
                              {(() => {
                                let mins = Math.round((new Date(session.checkOut.eventTime).getTime() - new Date(session.checkIn.eventTime).getTime()) / 60000);
                                if (mins < 0) mins += 1440;
                                return (mins / 60).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
                              })()} ساعة
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canEditAttendance && sessionIndex === 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditClick(record)}
                              disabled={dateLockStatus?.isLocked}
                              title={dateLockStatus?.isLocked ? `التاريخ مغلق - دفعة ${dateLockStatus.batch?.batchCode}` : 'تعديل سجل الحضور'}
                            >
                              {dateLockStatus?.isLocked ? (
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Edit className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-muted-foreground">
              عرض {((currentPage - 1) * pageSize) + 1} إلى {Math.min(currentPage * pageSize, total)} من {total} سجل
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                السابق
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ✅ Edit Dialog — يعرض كل الجلسات */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تعديل سجل الحضور</DialogTitle>
            <DialogDescription>
              تعديل أوقات الحضور والانصراف للعامل: {editingRecord?.workerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {editingSessions.map((session, idx) => (
              <div key={idx} className={`border rounded-lg p-4 ${idx > 0 ? 'border-blue-200 bg-blue-50/30' : ''}`}>
                <p className="font-medium mb-3 text-sm text-muted-foreground">
                  {idx === 0 ? 'الجلسة الأولى' : `↳ جلسة ${idx + 1}`}
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>وقت الحضور</Label>
                    <Input
                      type="time"
                      value={session.checkInTime}
                      onChange={(e) => {
                        const updated = [...editingSessions];
                        updated[idx] = { ...updated[idx], checkInTime: e.target.value };
                        setEditingSessions(updated);
                      }}
                      disabled={!session.checkInId}
                    />
                    {!session.checkInId && <p className="text-xs text-muted-foreground">لا يوجد حضور</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>وقت الانصراف</Label>
                    <Input
                      type="time"
                      value={session.checkOutTime}
                      onChange={(e) => {
                        const updated = [...editingSessions];
                        updated[idx] = { ...updated[idx], checkOutTime: e.target.value };
                        setEditingSessions(updated);
                      }}
                      disabled={!session.checkOutId}
                    />
                    {!session.checkOutId && <p className="text-xs text-muted-foreground">لا يوجد انصراف</p>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {session.checkInId && (
                    <Button variant="destructive" size="sm"
                      onClick={() => handleDeleteClick(session.checkInId!, 'checkIn')}
                      disabled={deletePunchMutation.isPending}>
                      <Trash2 className="h-3 w-3 mr-1" />حذف الحضور
                    </Button>
                  )}
                  {session.checkOutId && (
                    <Button variant="destructive" size="sm"
                      onClick={() => handleDeleteClick(session.checkOutId!, 'checkOut')}
                      disabled={deletePunchMutation.isPending}>
                      <Trash2 className="h-3 w-3 mr-1" />حذف الانصراف
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="سبب التعديل..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveEdit} disabled={updateEventMutation.isPending}>
              {updateEventMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absent Workers Dialog *//* Absent Workers Dialog */}
      <Dialog open={isAbsentDialogOpen} onOpenChange={setIsAbsentDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>العمال الغائبون</DialogTitle>
            <DialogDescription>
              قائمة العمال الغائبين ليوم {new Date(selectedDate).toLocaleDateString('ar-SA')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <Label>فلترة حسب المجموعة</Label>
              <Select value={absentFilterGroup} onValueChange={setAbsentFilterGroup}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {groups?.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!absentWorkers || absentWorkers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>لا يوجد عمال غائبون لهذا اليوم</p>
              </div>
            ) : (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50">
                      <TableHead className="text-right">كود العامل</TableHead>
                      <TableHead className="text-right">اسم العامل</TableHead>
                      <TableHead className="text-right">المجموعة</TableHead>
                      <TableHead className="text-right">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentWorkers.map((worker: any) => (
                      <TableRow key={worker.workerId} className="bg-red-50/50">
                        <TableCell className="font-mono">{worker.workerCode}</TableCell>
                        <TableCell className="font-medium">{worker.workerName}</TableCell>
                        <TableCell>{worker.groupName || '-'}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handlePrepareWorker(worker)}
                          >
                            تحضير
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAbsentDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prepare Worker Dialog */}
      <Dialog open={isPrepareDialogOpen} onOpenChange={setIsPrepareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تحضير يدوي</DialogTitle>
            <DialogDescription>
              إضافة حضور وانصراف يدوي للعامل: {selectedAbsentWorker?.workerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prepareCheckInTime">وقت الحضور *</Label>
              <Input
                id="prepareCheckInTime"
                type="time"
                value={prepareCheckInTime}
                onChange={(e) => setPrepareCheckInTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepareCheckOutTime">وقت الانصراف *</Label>
              <Input
                id="prepareCheckOutTime"
                type="time"
                value={prepareCheckOutTime}
                onChange={(e) => setPrepareCheckOutTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prepareNote">ملاحظة (اختياري)</Label>
              <Input
                id="prepareNote"
                value={prepareNote}
                onChange={(e) => setPrepareNote(e.target.value)}
                placeholder="سبب التحضير اليدوي..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrepareDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={handleSavePrepare} 
              disabled={addCheckInMutation.isPending || addCheckOutMutation.isPending}
            >
              {(addCheckInMutation.isPending || addCheckOutMutation.isPending) ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف سجل {deleteTarget?.eventType === 'checkIn' ? 'الحضور' : 'الانصراف'} للعامل <strong>{editingRecord?.workerName}</strong>؟
              <br /><br />
              <span className="text-destructive font-semibold">لن يمكن التراجع عن هذا الإجراء!</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              إلغاء
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDelete}
              disabled={deletePunchMutation.isPending}
            >
              {deletePunchMutation.isPending ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
