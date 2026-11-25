import { useEffect, useMemo, useState } from 'react';
import { Fingerprint, Link2, Loader2, Search, Unlink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type WorkerBiometricSelection = {
  personCode: string;
  displayName: string;
} | null;

type Props = {
  workerId?: number;
  workerName: string;
  value: WorkerBiometricSelection;
  currentPersonCode?: string | null;
  onChange: (value: WorkerBiometricSelection) => void;
};

export default function WorkerBiometricLinkPicker({
  workerId,
  workerName,
  value,
  currentPersonCode,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const effectiveCode = value?.personCode ?? null;
  const currentCode = currentPersonCode?.trim() || null;
  const hasPendingChange = effectiveCode !== currentCode;

  useEffect(() => {
    if (open) {
      setSearch(effectiveCode || '');
    }
  }, [open, effectiveCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const directoryQuery = trpc.workers.biometricDirectory.useQuery(
    {
      search: debouncedSearch || undefined,
      limit: 50,
      currentWorkerId: workerId,
    },
    {
      enabled: open,
      retry: false,
      staleTime: 10_000,
    },
  );

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    return value.displayName ? `${value.personCode} — ${value.displayName}` : value.personCode;
  }, [value]);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label className="flex items-center gap-2 text-sm font-semibold">
            <Fingerprint className="h-4 w-4" />
            الربط مع نظام البصمة
          </Label>
          <p className="text-xs text-muted-foreground">
            اختر الشخص من نظام البصمة؛ لا حاجة لكتابة الرقم يدويًا.
          </p>
        </div>
        {hasPendingChange && <Badge variant="secondary">سيُطبّق عند الحفظ</Badge>}
      </div>

      {value ? (
        <div className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-600">مربوط</Badge>
              <span className="font-mono text-sm" dir="ltr">{value.personCode}</span>
            </div>
            <p className="mt-1 truncate text-sm font-medium">{selectedLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Link2 className="ml-1 h-4 w-4" />
              تغيير الربط
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <Unlink className="ml-1 h-4 w-4" />
              إلغاء الربط
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-dashed bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">غير مربوط</p>
            <p className="text-xs text-muted-foreground">يمكن ربط العامل بشخص نشط من نظام البصمة.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Fingerprint className="ml-1 h-4 w-4" />
            ربط بالبصمة
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[620px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>اختيار شخص من نظام البصمة</DialogTitle>
            <DialogDescription>
              العامل: {workerName || 'عامل جديد'} — ابحث بالاسم أو رقم البصمة.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث بالاسم أو رقم البصمة..."
                className="pr-10"
                autoFocus
              />
            </div>

            {directoryQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                جاري قراءة دليل نظام البصمة...
              </div>
            ) : directoryQuery.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {directoryQuery.error.message || 'تعذر قراءة دليل نظام البصمة'}
              </div>
            ) : directoryQuery.data?.items.length ? (
              <div className="max-h-[360px] space-y-2 overflow-y-auto pl-1">
                {directoryQuery.data.items.map((person) => {
                  const linkedElsewhere = person.linkState === 'linked_other';
                  const isSelected = effectiveCode === person.personCode;
                  return (
                    <button
                      key={person.personCode}
                      type="button"
                      disabled={linkedElsewhere}
                      onClick={() => {
                        onChange({ personCode: person.personCode, displayName: person.displayName });
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-right transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold" dir="ltr">{person.personCode}</span>
                          {isSelected && <Badge>محدد</Badge>}
                          {person.linkState === 'linked_current' && <Badge variant="secondary">مرتبط بهذا العامل</Badge>}
                          {linkedElsewhere && <Badge variant="outline">مرتبط بعامل آخر</Badge>}
                        </div>
                        <p className="mt-1 truncate text-sm">{person.displayName}</p>
                        {linkedElsewhere && person.linkedWorker && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            مرتبط بـ {person.linkedWorker.fullName} ({person.linkedWorker.code})
                          </p>
                        )}
                      </div>
                      <Fingerprint className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                لا توجد نتائج مطابقة.
              </div>
            )}

            {directoryQuery.data?.page.hasMore && (
              <p className="text-center text-xs text-muted-foreground">
                توجد نتائج إضافية؛ استخدم البحث بالاسم أو رقم البصمة للوصول إليها بسرعة.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
