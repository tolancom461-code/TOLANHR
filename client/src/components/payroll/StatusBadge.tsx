import { Badge } from "@/components/ui/badge";

type BatchStatus =
  | "draft"
  | "under_accountant_review"
  | "returned_from_accountant"
  | "under_financial_review"
  | "returned_from_financial_review"
  | "under_accounts_manager_review"
  | "approved"
  | "rejected_final"
  | "paid";

const statusConfig: Record<
  BatchStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }
> = {
  draft: { label: "مسودة", variant: "secondary", color: "text-gray-600" },
  under_accountant_review: { label: "قيد مراجعة المحاسب", variant: "default", color: "text-blue-600" },
  returned_from_accountant: { label: "مرتجع من المحاسب", variant: "destructive", color: "text-red-600" },
  under_financial_review: { label: "قيد المراجعة المالية", variant: "default", color: "text-purple-600" },
  returned_from_financial_review: { label: "مرتجع من المراجع المالي", variant: "destructive", color: "text-red-600" },
  under_accounts_manager_review: { label: "قيد اعتماد مدير الحسابات", variant: "default", color: "text-indigo-600" },
  approved: { label: "معتمد", variant: "outline", color: "text-green-600" },
  rejected_final: { label: "مرفوض نهائياً", variant: "destructive", color: "text-red-700" },
  paid: { label: "مدفوع", variant: "outline", color: "text-green-700" },
};

interface StatusBadgeProps {
  status: BatchStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={className}>
      <span className={config.color}>{config.label}</span>
    </Badge>
  );
}
