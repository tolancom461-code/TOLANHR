import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EmptyGroupsMessageProps {
  costCenterName?: string;
  showAction?: boolean;
  onAction?: () => void;
}

export function EmptyGroupsMessage({ 
  costCenterName = 'مركز التكلفة المختار',
  showAction = false,
  onAction
}: EmptyGroupsMessageProps) {
  return (
    <Alert className="bg-amber-50 border-amber-200">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">لا توجد مجموعات متاحة</p>
            <p className="text-sm mt-1">
              لم يتم العثور على مجموعات مرتبطة بـ {costCenterName}. 
              يرجى اختيار مركز تكلفة آخر أو إضافة مجموعات جديدة.
            </p>
          </div>
          {showAction && onAction && (
            <button
              onClick={onAction}
              className="ml-4 px-3 py-1 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              إضافة مجموعة
            </button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyGroupsSelect() {
  return (
    <div className="p-4 text-center text-gray-500">
      <p className="text-sm">لا توجد مجموعات متاحة لمركز التكلفة المختار</p>
    </div>
  );
}
