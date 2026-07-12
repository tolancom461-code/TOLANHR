import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";

export default function OperationalFlagsSimple() {
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedWorker, setSelectedWorker] = useState<string>("");
  const [flagDate, setFlagDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Queries
  // Get all groups (OperationalFlags page doesn't filter by cost center)
  const { data: groups } = trpc.groups.list.useQuery();
  const { data: workers } = trpc.workers.list.useQuery(
    selectedGroup ? ({ groupId: parseInt(selectedGroup) } as any) : void 0
  );
  const { data: allFlags, refetch: refetchFlags } = trpc.operationalFlags.list.useQuery();
  const pendingFlags = (allFlags || []).filter((f: any) => f.status === "pending");

  // Mutations
  const createFlagMutation = trpc.operationalFlags.create.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء البلاغ بنجاح");
      setIsCreateOpen(false);
      setSelectedGroup("");
      setSelectedWorker("");
      setFlagDate("");
      setDescription("");
      refetchFlags();
    },
    onError: (error) => {
      toast.error(error.message || "فشل إنشاء البلاغ");
    },
  });

  const approveFlagMutation = trpc.operationalFlags.approve.useMutation({
    onSuccess: () => {
      toast.success("تم اعتماد البلاغ");
      refetchFlags();
    },
    onError: (error) => {
      toast.error(error.message || "فشل اعتماد البلاغ");
    },
  });

  const rejectFlagMutation = trpc.operationalFlags.reject.useMutation({
    onSuccess: () => {
      toast.success("تم رفض البلاغ");
      refetchFlags();
    },
    onError: (error) => {
      toast.error(error.message || "فشل رفض البلاغ");
    },
  });

  const handleCreateFlag = () => {
    if (!selectedWorker || !flagDate || !description) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    createFlagMutation.mutate({
      workerId: parseInt(selectedWorker),
      groupId: selectedGroup ? parseInt(selectedGroup) : undefined,
      flagDate: new Date(flagDate),
      description,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-yellow-500">بانتظار الموافقة</Badge>;
      case "approved":
        return <Badge className="bg-green-500">معتمد</Badge>;
      case "rejected":
        return <Badge className="bg-red-500">مرفوض</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">البلاغات التشغيلية</h1>
          <p className="text-muted-foreground mt-1">إدارة البلاغات التشغيلية والاستثناءات</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              بلاغ جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>إنشاء بلاغ تشغيلي جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Group Selection */}
              <div>
                <label className="text-sm font-medium">المجموعة</label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المجموعة" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Worker Selection */}
              <div>
                <label className="text-sm font-medium">العامل</label>
                <Select value={selectedWorker} onValueChange={setSelectedWorker} disabled={!selectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العامل" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers?.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id.toString()}>
                        {worker.fullName} ({worker.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div>
                <label className="text-sm font-medium">التاريخ</label>
                <Input
                  type="date"
                  value={flagDate}
                  onChange={(e) => setFlagDate(e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium">الوصف</label>
                <Textarea
                  placeholder="اشرح الاستثناء أو التعديل..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleCreateFlag}
                  disabled={createFlagMutation.isPending}
                  className="flex-1"
                >
                  {createFlagMutation.isPending ? "جاري الإنشاء..." : "إنشاء البلاغ"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Flags - Hidden Temporarily */}
      {false && <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">البلاغات المعلقة ({pendingFlags.length})</h2>
        {pendingFlags.length > 0 ? (
          <div className="space-y-3">
            {pendingFlags.map((flag) => (
              <div key={flag.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-yellow-500" />
                    <span className="font-medium">{flag.worker?.fullName}</span>
                    <span className="text-sm text-muted-foreground">({flag.worker?.code})</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{flag.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    التاريخ: {new Date(flag.flagDate).toLocaleDateString("ar-SA")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(flag.status)}
                  {flag.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => approveFlagMutation.mutate({ flagId: flag.id })}
                        disabled={approveFlagMutation.isPending}
                      >
                        <Check className="w-4 h-4" />
                        اعتماد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => rejectFlagMutation.mutate({ flagId: flag.id })}
                        disabled={rejectFlagMutation.isPending}
                      >
                        <X className="w-4 h-4" />
                        رفض
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            لا توجد بلاغات معلقة ✅
          </p>
        )}
      </Card>}
      {/* End Hidden Pending Flags */}

      {/* All Flags - Hidden Temporarily */}
      {false && <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">جميع البلاغات</h2>
        {(allFlags || []).length > 0 ? (
          <div className="space-y-2">
            {(allFlags || []).map((flag: any) => (
              <div key={flag.id} className="flex items-center justify-between p-3 border rounded text-sm">
                <div>
                  <span className="font-medium">{flag.worker?.fullName}</span>
                  <span className="text-muted-foreground ml-2">({flag.worker?.code})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{flag.description}</span>
                  {getStatusBadge(flag.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">لا توجد بلاغات</p>
        )}
      </Card>}
      {/* End Hidden All Flags */}
    </div>
  );
}
