import { useEffect, useState } from 'react';
import { Fingerprint, Link2, Loader2, Search, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatRiyadhAttendanceTime } from '@shared/attendance-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Choice = { identityId: string; deviceId: string; deviceUserId: string; displayName: string | null;
  deviceName: string | null; status: 'current' | 'historical'; linkId: string | null;
  linkState: 'available' | 'linked_current' | 'linked_other'; linkedWorker: { id: number; code: string; fullName: string } | null };

export default function BiometricSourceLinkPicker({ workerId, workerName, legacyPersonCode }:
  { workerId?: number; workerName: string; legacyPersonCode?: string | null }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [roster, setRoster] = useState<'current' | 'historical' | 'all'>('current');
  const [sortBy, setSortBy] = useState<'device_user_id' | 'name'>('device_user_id');
  const [selection, setSelection] = useState<Choice | null>(null);
  const [confirmHistorical, setConfirmHistorical] = useState(false);
  const [revoke, setRevoke] = useState<{ identityId: string; linkId: string; name: string; workerId: number; workerName: string } | null>(null);
  const utils = trpc.useUtils();
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setSelection(null); setConfirmHistorical(false); setRevoke(null); setOpen(false); }, [workerId]);
  const links = trpc.workers.sourceBiometricWorkerLinks.useQuery({ workerId: workerId ?? 0 }, { enabled: Boolean(workerId), retry: false });
  const directory = trpc.workers.sourceBiometricUsers.useQuery({ search: query || undefined, roster, sortBy,
    currentWorkerId: workerId, page, limit: 20 }, { enabled: open && Boolean(workerId), retry: false, staleTime: 10_000 });
  const save = trpc.workers.setSourceBiometricLink.useMutation();
  const remove = trpc.workers.revokeSourceBiometricLink.useMutation();
  const busy = save.isPending || remove.isPending;
  const searchPending = search.trim() !== query;
  useEffect(() => {
    if (!selection || !directory.data) return;
    const current = directory.data.items.find(item => item.identityId === selection.identityId);
    if (!current || current.linkState === 'linked_other' || current.linkId !== selection.linkId
      || current.status !== selection.status || current.displayName !== selection.displayName
      || current.deviceId !== selection.deviceId || current.deviceUserId !== selection.deviceUserId) {
      setSelection(null); setConfirmHistorical(false);
    }
  }, [directory.data, selection]);
  const clearSelection = () => { setSelection(null); setConfirmHistorical(false); };
  const refresh = async () => {
    await Promise.all([utils.workers.sourceBiometricWorkerLinks.invalidate(), utils.workers.sourceBiometricUsers.invalidate()]);
  };
  const saveSelection = async () => {
    if (!workerId || !selection || busy || searchPending || directory.isFetching || (selection.status === 'historical' && !confirmHistorical)) return;
    try {
      await save.mutateAsync({ workerId, identityId: selection.identityId, expectedLinkId: selection.linkId, confirmHistorical });
      setSelection(null); setConfirmHistorical(false); setOpen(false);
      await refresh(); toast.success('تم حفظ ربط المستخدم بالعامل. اعتماد الحركات ما زال متوقفًا.');
    } catch (error: any) { clearSelection(); toast.error(error?.message || 'تعذر حفظ الربط'); await refresh(); }
  };
  const revokeLink = async () => {
    if (!revoke || busy) return;
    try {
      await remove.mutateAsync({ workerId: revoke.workerId, identityId: revoke.identityId, expectedLinkId: revoke.linkId });
      setRevoke(null); await refresh(); toast.success('تم إلغاء الربط مع الاحتفاظ بسجله السابق.');
    } catch (error: any) { toast.error(error?.message || 'تعذر إلغاء الربط'); await refresh(); }
  };
  return <div className="space-y-3 rounded-lg border bg-muted/20 p-4" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Label className="flex items-center gap-2 font-semibold"><Fingerprint className="h-4 w-4" />الربط مع نظام البصمة</Label>
        <p className="mt-1 text-xs text-muted-foreground">اختر المستخدم من دليل الجهاز المتزامن. يُحفظ الربط بزر مستقل، واعتماد الحركات خطوة لاحقة.</p></div>
      <Button type="button" variant="outline" size="sm" disabled={!workerId || busy} onClick={() => { setSelection(null); setConfirmHistorical(false); setOpen(true); }}>
        <Link2 className="ml-1 h-4 w-4" />ربط بالبصمة</Button>
    </div>
    {!workerId ? <p className="text-sm text-muted-foreground">احفظ العامل أولًا، ثم افتح تعديله لربطه بمستخدم الجهاز.</p>
      : links.isLoading ? <p className="text-sm text-muted-foreground">جارٍ قراءة الروابط…</p>
      : links.error ? <p role="alert" className="text-sm text-destructive">{links.error.message}</p>
      : links.data?.items.length ? <div className="space-y-2">{links.data.items.map(link => <div key={link.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge>مربوط</Badge><bdi className="font-mono">{link.deviceUserId}</bdi>
          {link.status === 'historical' && <Badge variant="outline">هوية مؤرشفة</Badge>}</div>
          <p className="mt-1 text-sm">{link.displayName || 'اسم غير متوفر'} · {link.deviceName || link.deviceId}</p></div>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRevoke({ identityId: link.identityId, linkId: link.linkId, name: link.displayName || link.deviceUserId, workerId: workerId!, workerName })}><Unlink className="ml-1 h-4 w-4" />إلغاء الربط</Button>
      </div>)}</div> : <p className="text-sm text-muted-foreground">لم يُربط هذا العامل بمستخدم جهاز بعد.</p>}
    {legacyPersonCode && <p className="text-xs text-muted-foreground">كود الربط السابق المحفوظ: <bdi>{legacyPersonCode}</bdi></p>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]"><DialogHeader className="text-right sm:text-right">
      <DialogTitle>اختيار مستخدم من جهاز البصمة</DialogTitle><DialogDescription>العامل: {workerName} · اختر الاسم والرقم الصحيحين، ثم احفظ الربط.</DialogDescription>
    </DialogHeader><div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="relative min-w-[160px] flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="البحث في مستخدمي الجهاز" className="pr-10" value={search} onChange={event => { setSearch(event.target.value); clearSelection(); }} placeholder="ابحث بأي جزء من الاسم أو الرقم…" /></div>
        <Select value={roster} onValueChange={value => { setRoster(value as typeof roster); setPage(1); setSelection(null); setConfirmHistorical(false); }}><SelectTrigger className="w-[150px]" aria-label="قائمة المستخدمين"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="current">الحاليون</SelectItem><SelectItem value="historical">المؤرشفون</SelectItem><SelectItem value="all">الجميع</SelectItem></SelectContent></Select>
        <div className="space-y-1"><Label className="text-xs">ترتيب حسب</Label><Select value={sortBy} onValueChange={value => { setSortBy(value as typeof sortBy); setPage(1); clearSelection(); }}><SelectTrigger className="w-[190px]" aria-label="ترتيب حسب"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="device_user_id">رقم البصمة (تصاعديًا)</SelectItem><SelectItem value="name">الاسم (A–Z)</SelectItem></SelectContent></Select></div>
      </div>
      {directory.isLoading || searchPending ? <p className="flex items-center gap-2 py-5"><Loader2 className="h-4 w-4 animate-spin" />جارٍ قراءة الدليل المتزامن…</p>
        : directory.error ? <p role="alert" className="text-sm text-destructive">{directory.error.message}</p>
        : !directory.data?.items.length ? <p className="rounded border border-dashed p-5 text-sm text-muted-foreground">لا توجد نتائج. إذا كانت المزامنة مفعلة حديثًا، انتظر اكتمال دورة الدليل ثم أعد فتح القائمة.</p>
        : <div className="max-h-[280px] space-y-2 overflow-y-auto">{directory.data.items.map(item => <button type="button" key={item.identityId} disabled={busy || directory.isFetching || item.linkState === 'linked_other'}
          onClick={() => { setSelection(item); setConfirmHistorical(false); }} className={`w-full rounded-md border p-3 text-right disabled:opacity-50 ${selection?.identityId === item.identityId ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted'}`}>
          <div className="flex flex-wrap gap-2"><bdi className="font-mono">{item.deviceUserId}</bdi><span>{item.displayName || 'اسم غير متوفر'}</span>{item.status === 'historical' && <Badge variant="outline">مؤرشف</Badge>}{item.linkState === 'linked_current' && <Badge>مرتبط بهذا العامل</Badge>}</div>
          <p className="mt-1 text-xs text-muted-foreground">{item.deviceName || item.deviceId} · هوية التسجيل <bdi>{item.identityId}</bdi></p>
          <p className="mt-1 text-xs text-muted-foreground">آخر مزامنة · الرياض: {formatRiyadhAttendanceTime(item.lastSyncedAtUtc, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
          {item.linkedWorker && <p className="mt-1 text-xs">مرتبط بـ {item.linkedWorker.fullName}{item.linkedWorker.code && <> (<bdi>{item.linkedWorker.code}</bdi>)</>}</p>}
        </button>)}</div>}
      {directory.data?.items.filter(item => item.linkedWorkerExists === false && item.linkId && item.linkedWorker).map(item => <div key={`orphan-${item.identityId}`} className="rounded border bg-muted/30 p-3 text-sm">
        <p>المستخدم {item.displayName || item.deviceUserId} مرتبط بسجل عامل غير موجود: {item.linkedWorker!.fullName}.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" disabled={busy} onClick={() => { clearSelection(); setRevoke({ identityId: item.identityId, linkId: item.linkId!, name: item.displayName || item.deviceUserId, workerId: item.linkedWorker!.id, workerName: item.linkedWorker!.fullName }); }}>إلغاء الربط السابق</Button>
      </div>)}
      <div className="flex items-center justify-between"><Button type="button" variant="outline" size="sm" disabled={busy || page <= 1 || directory.isFetching || searchPending} onClick={() => { clearSelection(); setPage(value => value - 1); }}>السابق</Button><span className="text-xs text-muted-foreground">الصفحة {page} من {Math.max(1, directory.data?.page.totalPages ?? 1)}</span><Button type="button" variant="outline" size="sm" disabled={busy || directory.isFetching || searchPending || page >= (directory.data?.page.totalPages ?? 1)} onClick={() => { clearSelection(); setPage(value => value + 1); }}>التالي</Button></div>
      {selection && <div className="rounded border bg-muted/30 p-3 text-sm"><p>ربط <strong>{workerName}</strong> بالمستخدم <strong>{selection.displayName || selection.deviceUserId}</strong>، رقم <bdi>{selection.deviceUserId}</bdi>، على {selection.deviceName || selection.deviceId}.</p>
        {selection.status === 'historical' && <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={confirmHistorical} onChange={event => setConfirmHistorical(event.target.checked)} />أؤكد اختيار هذه الهوية المؤرشفة لهذا العامل.</label>}</div>}
      <div className="flex gap-2"><Button type="button" disabled={!selection || busy || directory.isFetching || searchPending || Boolean(directory.error) || (selection.status === 'historical' && !confirmHistorical)} onClick={saveSelection}>{save.isPending ? 'جارٍ حفظ الربط…' : 'حفظ الربط'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>إغلاق</Button></div>
    </div></DialogContent></Dialog>
    <Dialog open={Boolean(revoke)} onOpenChange={value => { if (!value && !busy) setRevoke(null); }}><DialogContent dir="rtl"><DialogHeader className="text-right sm:text-right"><DialogTitle>إلغاء ربط المستخدم</DialogTitle><DialogDescription>إلغاء ربط {revoke?.name} بالعامل {revoke?.workerName}؟ يبقى سجل الربط السابق محفوظًا.</DialogDescription></DialogHeader><div className="flex gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={revokeLink}>تأكيد إلغاء الربط</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setRevoke(null)}>رجوع</Button></div></DialogContent></Dialog>
  </div>;
}
