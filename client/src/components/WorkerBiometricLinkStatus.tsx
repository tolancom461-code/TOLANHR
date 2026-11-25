import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';

export default function WorkerBiometricLinkStatus({ workerId, legacyCode }: { workerId: number; legacyCode?: string | null }) {
  const mode = trpc.workers.sourceBiometricMode.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const links = trpc.workers.sourceBiometricWorkerLinks.useQuery({ workerId }, { enabled: mode.data?.enabled === true, retry: false });
  if (mode.isLoading || (mode.data?.enabled && links.isLoading)) return <p className="text-sm text-muted-foreground">جارٍ قراءة الربط…</p>;
  if (mode.error || (mode.data?.enabled && links.error)) return <p className="text-sm text-muted-foreground">تعذر عرض ربط البصمة لهذا الحساب.</p>;
  if (!mode.data?.enabled) return legacyCode
    ? <div className="flex items-center gap-2"><Badge variant="secondary">مربوط</Badge><bdi className="font-mono text-sm">{legacyCode}</bdi></div>
    : <p className="font-semibold text-muted-foreground">غير مربوط</p>;
  return <div className="space-y-2">
    {links.data?.items.length ? links.data.items.map(link => <div key={link.linkId} className="text-sm"><Badge variant="secondary">مربوط</Badge> <bdi>{link.deviceUserId}</bdi> — {link.displayName || 'اسم غير متوفر'}<p className="text-xs text-muted-foreground">{link.deviceName || link.deviceId}{link.status === 'historical' ? ' · هوية مؤرشفة' : ''}</p></div>)
      : <p className="font-semibold text-muted-foreground">غير مربوط بدليل الجهاز</p>}
    {legacyCode && <p className="text-xs text-muted-foreground">كود الربط السابق المحفوظ: <bdi>{legacyCode}</bdi></p>}
  </div>;
}
