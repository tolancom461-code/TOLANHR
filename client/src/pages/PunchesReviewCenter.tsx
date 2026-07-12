import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PunchesReviewCenter() {
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [timeInput, setTimeInput] = useState("");

  // ✅ حالات إضافة جلسة كاملة
  const [sessionWorkerId, setSessionWorkerId] = useState<string>("");
  const [sessionCheckIn, setSessionCheckIn] = useState("");
  const [sessionCheckOut, setSessionCheckOut] = useState("");

  // Fetch incomplete attendance records
  const { data: incompleteRecords = [], isLoading, refetch } = (trpc.attendance as any).getForReview.useQuery({
    workDateStr: selectedDate,
  });

  // Fetch groups for filter
  const { data: groups = [] } = trpc.groups.list.useQuery();

  // ✅ جلب قائمة العمال لإضافة الجلسة
  const { data: allWorkers = [] } = trpc.workers.list.useQuery();

  // Mutations
  const addCheckInMutation = trpc.attendance.addMissingCheckIn.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة وقت الحضور بنجاح");
      refetch();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`فشل إضافة وقت الحضور: ${error.message}`);
    },
  });

  const addCheckOutMutation = trpc.attendance.addMissingCheckOut.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة وقت الانصراف بنجاح");
      refetch();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`فشل إضافة وقت الانصراف: ${error.message}`);
    },
  });

  const deletePunchMutation = trpc.attendance.deletePunchEvent.useMutation({
    onSuccess: () => {
      toast.success("تم حذف البصمة بنجاح");
      refetch();
      setDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`فشل حذف البصمة: ${error.message}`);
    },
  });

  // ✅ mutation إضافة جلسة كاملة
  const addFullSessionMutation = (trpc.attendance as any).addFullSession.useMutation({
    onSuccess: () => {
      toast.success("تم إضافة الجلسة بنجاح");
      refetch();
      setSessionWorkerId("");
      setSessionCheckIn("");
      setSessionCheckOut("");
    },
    onError: (error: any) => {
      toast.error(`فشل إضافة الجلسة: ${error.message}`);
    },
  });

  // Filter records by group
  const filteredRecords = selectedGroup === "all" 
    ? incompleteRecords 
    : incompleteRecords.filter((r: any) => r.groupId?.toString() === selectedGroup);

  // Count incomplete records
  const incompleteCount = filteredRecords.length;

  const handleAddMissing = (record: any, type: 'check_in' | 'check_out') => {
    setSelectedRecord({ ...record, actionType: type });
    setTimeInput("");
    setDialogOpen(true);
  };

  const handleDelete = (record: any) => {
    setSelectedRecord({ ...record, actionType: 'delete' });
    setDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!selectedRecord) return;

    const workDate = new Date(selectedDate);
    
    if (selectedRecord.actionType === 'check_in') {
      if (!timeInput) {
        toast.error("يرجى إدخال وقت الحضور");
        return;
      }
      const [hours, minutes] = timeInput.split(':');
      const checkInDate = new Date(workDate);
      checkInDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      addCheckInMutation.mutate({
        workerId: selectedRecord.workerId,
        checkInTime: checkInDate.toISOString(),
        note: "تم الإضافة يدوياً من مركز مراجعة البصمات",
      });
    } else if (selectedRecord.actionType === 'check_out') {
      if (!timeInput) {
        toast.error("يرجى إدخال وقت الانصراف");
        return;
      }
      const [hours, minutes] = timeInput.split(':');
      const checkOutDate = new Date(workDate);
      checkOutDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      addCheckOutMutation.mutate({
        workerId: selectedRecord.workerId,
        checkOutTime: checkOutDate.toISOString(),
        note: "تم الإضافة يدوياً من مركز مراجعة البصمات",
      });
    } else if (selectedRecord.actionType === 'delete') {
      const eventId = selectedRecord.checkInId ?? selectedRecord.checkOutId;
      
      if (!eventId) {
        toast.error("خطأ: لم يتم العثور على معرف البصمة");
        return;
      }
      
      deletePunchMutation.mutate({
        eventId,
        reason: "حذف من مركز مراجعة البصمات - بصمة خاطئة",
      });
    }
  };

  // ✅ إضافة جلسة كاملة
  const handleAddFullSession = () => {
    if (!sessionWorkerId || !sessionCheckIn || !sessionCheckOut) return;

    const workDate = new Date(selectedDate);

    const [inH, inM] = sessionCheckIn.split(':');
    const checkInDate = new Date(workDate);
    checkInDate.setHours(parseInt(inH), parseInt(inM), 0, 0);

    const [outH, outM] = sessionCheckOut.split(':');
    const checkOutDate = new Date(workDate);
    checkOutDate.setHours(parseInt(outH), parseInt(outM), 0, 0);

    // لو الخروج قبل الدخول — يعني تجاوز منتصف الليل
    if (checkOutDate < checkInDate) {
      checkOutDate.setDate(checkOutDate.getDate() + 1);
    }

    addFullSessionMutation.mutate({
      workerId: parseInt(sessionWorkerId),
      checkInTime: checkInDate.toISOString(),
      checkOutTime: checkOutDate.toISOString(),
      note: 'تم إضافة جلسة كاملة يدوياً',
    });
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">مركز مراجعة البصمات</h1>
        <p className="text-muted-foreground">
          مراجعة ومعالجة البصمات الناقصة (حضور بدون انصراف أو انصراف بدون حضور)
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>الفلاتر</CardTitle>
          <CardDescription>اختر التاريخ والمجموعة للفلترة</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">التاريخ</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="group">المجموعة</Label>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger id="group">
                  <SelectValue placeholder="اختر المجموعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع المجموعات</SelectItem>
                  {groups.map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card className="mb-6 border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertCircle className="h-5 w-5" />
            بصمات ناقصة
          </CardTitle>
          <CardDescription>يجب معالجة جميع البصمات قبل إنشاء دفعة رواتب</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-700">{incompleteCount}</div>
          <p className="text-sm text-muted-foreground">بصمة تحتاج معالجة</p>
        </CardContent>
      </Card>

      {/* ✅ إضافة جلسة كاملة */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Plus className="h-5 w-5" />
            إضافة جلسة كاملة
          </CardTitle>
          <CardDescription>
            إضافة دخول وخروج جديد لأي عامل في التاريخ المحدد أعلاه
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <Label>العامل</Label>
              <Select value={sessionWorkerId} onValueChange={setSessionWorkerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العامل" />
                </SelectTrigger>
                <SelectContent>
                  {(allWorkers as any[]).map((w: any) => (
                    <SelectItem key={w.id} value={w.id.toString()}>
                      {w.fullName} ({w.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>وقت الدخول</Label>
              <Input
                type="time"
                value={sessionCheckIn}
                onChange={(e) => setSessionCheckIn(e.target.value)}
              />
            </div>
            <div>
              <Label>وقت الخروج</Label>
              <Input
                type="time"
                value={sessionCheckOut}
                onChange={(e) => setSessionCheckOut(e.target.value)}
              />
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={
                !sessionWorkerId ||
                !sessionCheckIn ||
                !sessionCheckOut ||
                addFullSessionMutation.isPending
              }
              onClick={handleAddFullSession}
            >
              {addFullSessionMutation.isPending ? 'جاري الحفظ...' : 'إضافة الجلسة'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>سجلات البصمات</CardTitle>
          <CardDescription>
            اضغط على أي سجل لعرض التفاصيل والإجراءات أو الزر
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              ✅ لا توجد بصمات ناقصة لهذا التاريخ
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رمز العامل</TableHead>
                  <TableHead>اسم العامل</TableHead>
                  <TableHead>المجموعة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>وقت الحضور</TableHead>
                  <TableHead>وقت الانصراف</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record: any, index: number) => (
                  <TableRow 
                    key={index}
                    className="border-l-4 border-l-orange-500 bg-orange-50/50"
                  >
                    <TableCell className="font-medium">{record.workerCode}</TableCell>
                    <TableCell>{record.workerName}</TableCell>
                    <TableCell>{record.groupName || "غير محدد"}</TableCell>
                    <TableCell>
                      {!record.checkInTime && record.checkOutTime && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          انصراف بدون حضور
                        </Badge>
                      )}
                      {record.checkInTime && !record.checkOutTime && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          حضور بدون انصراف
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.checkInTime ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-green-600" />
                          {new Date(record.checkInTime).toLocaleTimeString('ar-SA', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      ) : (
                        <span className="text-red-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.checkOutTime ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-blue-600" />
                          {new Date(record.checkOutTime).toLocaleTimeString('ar-SA', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                      ) : (
                        <span className="text-red-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-center">
                        {!record.checkInTime && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddMissing(record, 'check_in')}
                            className="gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            إضافة حضور
                          </Button>
                        )}
                        {!record.checkOutTime && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddMissing(record, 'check_out')}
                            className="gap-1"
                          >
                            <Plus className="h-4 w-4" />
                            إضافة انصراف
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(record)}
                          className="gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRecord?.actionType === 'check_in' && "إضافة وقت حضور"}
              {selectedRecord?.actionType === 'check_out' && "إضافة وقت انصراف"}
              {selectedRecord?.actionType === 'delete' && "تأكيد حذف البصمة"}
            </DialogTitle>
            <DialogDescription>
              {selectedRecord?.actionType === 'delete' ? (
                <>هل أنت متأكد من حذف هذه البصمة؟ هذا الإجراء لا يمكن التراجع عنه.</>
              ) : (
                <>العامل: {selectedRecord?.workerName} ({selectedRecord?.workerCode})</>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedRecord?.actionType !== 'delete' && (
            <div className="py-4">
              <Label htmlFor="time">
                {selectedRecord?.actionType === 'check_in' ? "وقت الحضور" : "وقت الانصراف"}
              </Label>
              <Input
                id="time"
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="mt-2"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant={selectedRecord?.actionType === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
              disabled={
                addCheckInMutation.isPending || 
                addCheckOutMutation.isPending || 
                deletePunchMutation.isPending
              }
            >
              {selectedRecord?.actionType === 'delete' ? 'حذف' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
