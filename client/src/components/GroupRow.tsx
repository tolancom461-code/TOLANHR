import { memo } from "react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Trash2 } from "lucide-react";

interface GroupRowProps {
  group: any;
  onView: (group: any) => void;
  onEdit: (group: any) => void;
  onDelete: (group: any) => void;
  hasPermission: boolean;
}

const GroupRow = memo(({
  group,
  onView,
  onEdit,
  onDelete,
  hasPermission,
}: GroupRowProps) => (
  <TableRow>
    <TableCell className="font-medium">{group.name}</TableCell>
    <TableCell>{group.description || "-"}</TableCell>
    <TableCell>
      <Badge variant="outline">{group.workerCount || 0} عامل</Badge>
    </TableCell>
    <TableCell>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onView(group)}
          title="عرض التفاصيل"
        >
          <Eye className="h-4 w-4" />
        </Button>
        {hasPermission && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(group)}
              title="تعديل"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(group)}
              title="حذف"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </TableCell>
  </TableRow>
));

GroupRow.displayName = "GroupRow";

export default GroupRow;
