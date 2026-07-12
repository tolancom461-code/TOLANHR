import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TableCell, TableRow } from '@/components/ui/table';
import { Eye, QrCode, Download, Pencil } from 'lucide-react';

interface WorkerRowProps {
  worker: any;
  onView: (worker: any) => void;
  onShowQR: (worker: any) => void;
  onExportQR: (workerId: number) => void;
  onEdit: (worker: any) => void;
  hasPermission: boolean;
  getInitials: (name: string) => string;
  getGroupName: (groupId: number) => string;
  getStatusBadge: (status: string) => React.ReactNode;
}

const WorkerRow = memo(({
  worker,
  onView,
  onShowQR,
  onExportQR,
  onEdit,
  hasPermission,
  getInitials,
  getGroupName,
  getStatusBadge,
}: WorkerRowProps) => (
  <TableRow>
    <TableCell>
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={worker.photoUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {getInitials(worker.fullName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="font-medium">{worker.fullName}</div>
          <div className="text-sm text-muted-foreground">{worker.phone || "-"}</div>
        </div>
      </div>
    </TableCell>
    <TableCell className="font-mono">{worker.code}</TableCell>
    <TableCell>{worker.nationalId || "-"}</TableCell>
    <TableCell>{getGroupName(worker.groupId)}</TableCell>
    <TableCell>{getStatusBadge(worker.status || "active")}</TableCell>
    <TableCell>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onView(worker)}
          title="عرض التفاصيل"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onShowQR(worker)}
          title="رمز QR"
        >
          <QrCode className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onExportQR(worker.id)}
          title="تصدير QR إلى PDF"
        >
          <Download className="h-4 w-4" />
        </Button>
        {hasPermission && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(worker)}
            title="تعديل"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>
    </TableCell>
  </TableRow>
));

WorkerRow.displayName = 'WorkerRow';

export default WorkerRow;
