import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface GroupScheduleStatusProps {
  groupId: number;
}

export function GroupScheduleStatus({ groupId }: GroupScheduleStatusProps) {
  const { data: hasSchedules, isLoading } = trpc.groups.checkHasSchedules.useQuery({ groupId });

  if (isLoading) {
    return <Badge variant="outline">جاري التحقق...</Badge>;
  }

  if (hasSchedules) {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        محدد
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        غير محدد
      </Badge>
      <Link href="/schedules/weekly">
        <Button variant="link" size="sm" className="h-auto p-0 text-xs">
          إضافة جدول
        </Button>
      </Link>
    </div>
  );
}
