import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Fingerprint, Link2, Loader2, Plus, Radio, RefreshCw, Server, ShieldAlert } from "lucide-react";

const rawStatusLabels: Record<string, string> = {
  pending: "قيد المعالجة",
  processed: "تم التسجيل",
  duplicate: "مكرر",
  unmapped: "عامل غير مربوط",
  review: "يحتاج مراجعة",
  error: "خطأ",
};

const eventTypeLabels: Record<string, string> = {
  check_in: "دخول",
  check_out: "خروج",
  unknown: "غير محدد",
};

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const text = String(value);
  // biometric_devices.last_seen_at is a DATETIME intentionally written in
  // Riyadh local time. Do not let the browser reinterpret a timezone-less
  // value and add another +3 hours.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) {
    return text.slice(0, 19).replace('T', ' ');
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "processed") return "default";
  if (status === "error") return "destructive";
  if (status === "review" || status === "unmapped") return "secondary";
  return "outline";
}

export default function BiometricDevices() {
  const utils = trpc.useUtils();
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [rawStatus, setRawStatus] = useState<string>("all");

  const [deviceName, setDeviceName] = useState("جهاز البصمة الرئيسي");
  const [serialNumber, setSerialNumber] = useState("");
  const [model, setModel] = useState("MB2000");
  const [locationName, setLocationName] = useState("");
  const [costCenterId, setCostCenterId] = useState<string>("none");

  const [workerId, setWorkerId] = useState<string>("");
  const [deviceUserId, setDeviceUserId] = useState("");

  const devicesQuery = trpc.biometric.devices.useQuery();
  const workersQuery = trpc.workers.list.useQuery();
  const costCentersQuery = trpc.costCenters.list.useQuery();

  useEffect(() => {
    if (!selectedDeviceId && devicesQuery.data?.length) {
      setSelectedDeviceId(devicesQuery.data[0].id);
    }
  }, [devicesQuery.data, selectedDeviceId]);

  const mappingsQuery = trpc.biometric.mappings.useQuery(
    { deviceId: selectedDeviceId ?? undefined },
    { enabled: Boolean(selectedDeviceId) },
  );

  const rawEventsQuery = trpc.biometric.rawEvents.useQuery(
    {
      deviceId: selectedDeviceId ?? undefined,
      status: rawStatus === "all" ? undefined : rawStatus as any,
      limit: 150,
    },
    { enabled: Boolean(selectedDeviceId), refetchInterval: 15_000 },
  );

  const createDevice = trpc.biometric.createDevice.useMutation({
    onSuccess: async data => {
      toast.success("تمت إضافة جهاز البصمة");
      setCreateOpen(false);
      setSerialNumber("");
      await utils.biometric.devices.invalidate();
      if (data.id) setSelectedDeviceId(data.id);
    },
    onError: error => toast.error("تعذر إضافة الجهاز", { description: error.message }),
  });

  const updateDevice = trpc.biometric.updateDevice.useMutation({
    onSuccess: async () => {
      await utils.biometric.devices.invalidate();
      toast.success("تم تحديث حالة الجهاز");
    },
    onError: error => toast.error("تعذر تحديث الجهاز", { description: error.message }),
  });

  const resetAcceptanceWindow = trpc.biometric.resetAcceptanceWindow.useMutation({
    onSuccess: async data => {
      await utils.biometric.devices.invalidate();
      toast.success("تم ضبط بداية قبول الحركات من الآن", { description: data.acceptEventsAfter });
    },
    onError: error => toast.error("تعذر تحديث بداية القبول", { description: error.message }),
  });

  const upsertMapping = trpc.biometric.upsertMapping.useMutation({
    onSuccess: async () => {
      setWorkerId("");
      setDeviceUserId("");
      await utils.biometric.mappings.invalidate();
      toast.success("تم ربط العامل بالجهاز");
    },
    onError: error => toast.error("تعذر حفظ الربط", { description: error.message }),
  });

  const setMappingActive = trpc.biometric.setMappingActive.useMutation({
    onSuccess: async () => {
      await utils.biometric.mappings.invalidate();
      toast.success("تم تحديث الربط");
    },
    onError: error => toast.error("تعذر تحديث الربط", { description: error.message }),
  });

  const retryRawEvent = trpc.biometric.retryRawEvent.useMutation({
    onSuccess: async () => {
      await utils.biometric.rawEvents.invalidate();
      toast.success("تمت إعادة معالجة الحركة");
    },
    onError: error => toast.error("تعذرت إعادة المعالجة", { description: error.message }),
  });

  const selectedDevice = useMemo(
    () => devicesQuery.data?.find(device => device.id === selectedDeviceId) ?? null,
    [devicesQuery.data, selectedDeviceId],
  );

  const activeWorkers = useMemo(
    () => (workersQuery.data ?? []).filter(worker => worker.status === "active"),
    [workersQuery.data],
  );

  const handleCreateDevice = () => {
    if (!deviceName.trim() || !serialNumber.trim()) {
      toast.error("اسم الجهاز والرقم التسلسلي مطلوبان");
      return;
    }
    createDevice.mutate({
      name: deviceName.trim(),
      serialNumber: serialNumber.trim(),
      model: model.trim() || null,
      protocolMode: "ta_push",
      locationName: locationName.trim() || null,
      costCenterId: costCenterId === "none" ? null : Number(costCenterId),
      timezone: "Asia/Riyadh",
    });
  };

  const handleAddMapping = () => {
    if (!selectedDeviceId || !workerId || !deviceUserId.trim()) {
      toast.error("اختر العامل وأدخل رقمه داخل جهاز البصمة");
      return;
    }
    upsertMapping.mutate({
      deviceId: selectedDeviceId,
      workerId: Number(workerId),
      deviceUserId: deviceUserId.trim(),
    });
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Fingerprint className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">أجهزة البصمة</h1>
            <p className="text-sm text-muted-foreground">
              إدارة أجهزة ZKTeco وربط أرقام المستخدمين ومتابعة حركات ADMS/PUSH الخام.
            </p>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="ml-2 h-4 w-4" />إضافة جهاز</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة جهاز بصمة</DialogTitle>
              <DialogDescription>
                أدخل الرقم التسلسلي كما يظهر في الجهاز. أي Serial غير مسجل لن ينشئ حضورًا.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>اسم الجهاز</Label>
                <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Serial Number</Label>
                <Input dir="ltr" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="مثال: MB2000-001" />
              </div>
              <div className="space-y-2">
                <Label>الموديل</Label>
                <Input value={model} onChange={e => setModel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>الموقع</Label>
                <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="البوابة الرئيسية" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>مركز التكلفة (اختياري)</Label>
                <Select value={costCenterId} onValueChange={setCostCenterId}>
                  <SelectTrigger><SelectValue placeholder="بدون ربط" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {(costCentersQuery.data ?? []).map(center => (
                      <SelectItem key={center.id} value={String(center.id)}>{center.code} — {center.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateDevice} disabled={createDevice.isPending}>
                {createDevice.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                حفظ الجهاز
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />الأجهزة المسجلة</CardTitle>
          <CardDescription>اختر جهازًا لإدارة الربط والسجلات الخاصة به.</CardDescription>
        </CardHeader>
        <CardContent>
          {devicesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />جاري التحميل...</div>
          ) : !devicesQuery.data?.length ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              لا يوجد جهاز مسجل بعد. أضف الجهاز قبل ضبط ADMS عليه.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {devicesQuery.data.map(device => (
                <button
                  type="button"
                  key={device.id}
                  onClick={() => setSelectedDeviceId(device.id)}
                  className={`rounded-xl border p-4 text-right transition-colors ${selectedDeviceId === device.id ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{device.name}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{device.serialNumber}</div>
                    </div>
                    <Badge variant={device.isActive ? "default" : "secondary"}>{device.isActive ? "نشط" : "معطل"}</Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>{device.model || "-"} {device.locationName ? `— ${device.locationName}` : ""}</div>
                    <div>آخر اتصال: {formatDateTime(device.lastSeenAt)}</div>
                    <div dir="ltr" className="text-right">IP: {device.lastIpAddress || "-"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDevice && (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <Radio className="h-4 w-4" />{selectedDevice.name}
                </div>
                <p className="text-sm text-muted-foreground">
                  البروتوكول: {selectedDevice.protocolMode} — المنطقة الزمنية: {selectedDevice.timezone}
                </p>
                <p className="text-xs text-muted-foreground">
                  بداية قبول الحركات: <span dir="ltr">{selectedDevice.acceptEventsAfter}</span>
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">ADMS endpoint: /iclock/cdata</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetAcceptanceWindow.isPending}
                  onClick={() => resetAcceptanceWindow.mutate({ id: selectedDevice.id })}
                >
                  {resetAcceptanceWindow.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  قبول الحركات من الآن
                </Button>
                <Label htmlFor="device-active">السماح باستقبال الحضور</Label>
                <Switch
                  id="device-active"
                  checked={Boolean(selectedDevice.isActive)}
                  disabled={updateDevice.isPending}
                  onCheckedChange={checked => updateDevice.mutate({ id: selectedDevice.id, isActive: checked })}
                />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="mappings" className="space-y-4">
            <TabsList>
              <TabsTrigger value="mappings">ربط العمال</TabsTrigger>
              <TabsTrigger value="raw">السجل الخام</TabsTrigger>
            </TabsList>

            <TabsContent value="mappings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />ربط عامل</CardTitle>
                  <CardDescription>
                    رقم المستخدم هو الرقم المسجل للعامل داخل جهاز البصمة، وليس بالضرورة رقم قاعدة البيانات.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
                    <div className="space-y-2">
                      <Label>العامل</Label>
                      <Select value={workerId} onValueChange={setWorkerId}>
                        <SelectTrigger><SelectValue placeholder="اختر العامل" /></SelectTrigger>
                        <SelectContent>
                          {activeWorkers.map(worker => (
                            <SelectItem key={worker.id} value={String(worker.id)}>{worker.code} — {worker.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>رقم المستخدم في الجهاز</Label>
                      <Input dir="ltr" value={deviceUserId} onChange={e => setDeviceUserId(e.target.value)} placeholder="60001" />
                    </div>
                    <Button onClick={handleAddMapping} disabled={upsertMapping.isPending}>
                      {upsertMapping.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      حفظ الربط
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>العمال المرتبطون</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العامل</TableHead>
                        <TableHead>رقم العامل</TableHead>
                        <TableHead>رقم الجهاز</TableHead>
                        <TableHead>الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(mappingsQuery.data ?? []).map(mapping => (
                        <TableRow key={mapping.id}>
                          <TableCell>{mapping.workerName || `عامل #${mapping.workerId}`}</TableCell>
                          <TableCell>{mapping.workerCode || "-"}</TableCell>
                          <TableCell dir="ltr" className="text-right font-mono">{mapping.deviceUserId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={Boolean(mapping.isActive)}
                                onCheckedChange={checked => setMappingActive.mutate({ id: mapping.id, isActive: checked })}
                              />
                              <span className="text-xs text-muted-foreground">{mapping.isActive ? "نشط" : "متوقف"}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!mappingsQuery.isLoading && !mappingsQuery.data?.length && (
                        <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">لا توجد روابط لهذا الجهاز.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="raw">
              <Card>
                <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />حركات الجهاز الخام</CardTitle>
                    <CardDescription>هذا السجل يبقى مرجعًا لما أرسله الجهاز قبل/بعد تحويله إلى حضور.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={rawStatus} onValueChange={setRawStatus}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الحالات</SelectItem>
                        {Object.entries(rawStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => rawEventsQuery.refetch()} title="تحديث">
                      <RefreshCw className={`h-4 w-4 ${rawEventsQuery.isFetching ? "animate-spin" : ""}`} />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الوقت</TableHead>
                        <TableHead>رقم المستخدم</TableHead>
                        <TableHead>الحركة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>حدث الحضور</TableHead>
                        <TableHead>التفاصيل</TableHead>
                        <TableHead>إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rawEventsQuery.data ?? []).map(event => (
                        <TableRow key={String(event.id)}>
                          <TableCell dir="ltr" className="text-right whitespace-nowrap">{event.eventTimeLocal}</TableCell>
                          <TableCell dir="ltr" className="text-right font-mono">{event.deviceUserId}</TableCell>
                          <TableCell>{eventTypeLabels[event.normalizedEventType] || event.normalizedEventType}</TableCell>
                          <TableCell><Badge variant={statusVariant(event.processingStatus)}>{rawStatusLabels[event.processingStatus] || event.processingStatus}</Badge></TableCell>
                          <TableCell>{event.attendanceEventId ? `#${event.attendanceEventId}` : "-"}</TableCell>
                          <TableCell className="max-w-sm text-xs text-muted-foreground">
                            {event.errorMessage || `status=${event.rawStatus ?? "-"}, verify=${event.verifyMode ?? "-"}`}
                          </TableCell>
                          <TableCell>
                            {["unmapped", "review", "error"].includes(event.processingStatus) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryRawEvent.isPending}
                                onClick={() => retryRawEvent.mutate({ id: Number(event.id) })}
                              >
                                إعادة المعالجة
                              </Button>
                            ) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!rawEventsQuery.isLoading && !rawEventsQuery.data?.length && (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لم تصل حركات من هذا الجهاز بعد.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="border-dashed">
            <CardContent className="flex gap-3 pt-6 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <p>
                لا يخزن النظام قالب البصمة أو صورة الوجه. حاليًا التكامل يستقبل ATTLOG فقط، وأي بيانات تسجيل مستخدمين/قوالب من الجهاز يتم تجاهلها عمدًا.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
