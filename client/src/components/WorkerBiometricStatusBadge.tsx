import { Badge } from '@/components/ui/badge';
import type { SourceBiometricLinkSummary } from '../../../server/biometric-directory/worker-list-links';

export default function WorkerBiometricStatusBadge({ legacyCode, sourceLink }: {
  legacyCode?: string | null;
  sourceLink?: SourceBiometricLinkSummary;
}) {
  if (sourceLink !== undefined) {
    if (sourceLink?.state === 'unlinked') {
      return <span className="text-sm text-muted-foreground">غير مربوط</span>;
    }
    if (sourceLink?.state === 'linked' && sourceLink.links.length > 0) {
      const title = sourceLink.links.map(link =>
        link.displayName ? `${link.deviceUserId} — ${link.displayName}` : link.deviceUserId,
      ).join('، ');
      return <div className="flex items-center gap-2" title={title}>
        <Badge variant="secondary">مربوط</Badge>
        <bdi className="font-mono text-xs">{sourceLink.links[0].deviceUserId}</bdi>
        {sourceLink.links.length > 1 && <span className="text-xs text-muted-foreground">+{sourceLink.links.length - 1}</span>}
      </div>;
    }
    return <span className="text-xs text-muted-foreground">تعذر التحقق من الربط</span>;
  }

  return legacyCode ? <div className="flex items-center gap-2">
    <Badge variant="secondary">مربوط</Badge>
    <bdi className="font-mono text-xs">{legacyCode}</bdi>
  </div> : <span className="text-sm text-muted-foreground">غير مربوط</span>;
}
