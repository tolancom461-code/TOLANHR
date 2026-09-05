import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { WORKER_PHOTO_POLICY } from '@shared/workerPhotoPolicy';
import WorkerPhotoPreview from '@/components/WorkerPhotoPreview';
import { formatFileSize, prepareWorkerPhoto } from '@/lib/imageCompression';

interface WorkerPhotoPickerProps {
  workerName: string;
  currentPhotoUrl?: string | null;
  value: File | null;
  onChange: (file: File) => void;
}

export default function WorkerPhotoPicker({
  workerName,
  currentPhotoUrl,
  value,
  onChange,
}: WorkerPhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow choosing the same file again after a validation failure.
    event.target.value = '';
    if (!file) return;

    try {
      setIsProcessing(true);
      const prepared = await prepareWorkerPhoto(file);
      onChange(prepared);
    } catch (error: any) {
      toast.error(error?.message || 'تعذر تجهيز الصورة');
    } finally {
      setIsProcessing(false);
    }
  };

  const displayedPhoto = previewUrl || currentPhotoUrl || null;
  const buttonLabel = displayedPhoto ? 'استبدال الصورة' : 'اختيار صورة';

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <Label>صورة العامل</Label>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <WorkerPhotoPreview
          src={displayedPhoto}
          workerName={workerName || 'العامل'}
          className="h-24 w-24"
          fallbackIconClassName="h-10 w-10"
        />
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="ml-2 h-4 w-4" />
            )}
            {isProcessing ? 'جاري تجهيز الصورة...' : buttonLabel}
          </Button>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            JPG أو PNG أو WebP حتى {WORKER_PHOTO_POLICY.originalMaxBytes / (1024 * 1024)} MB. يتم تجهيز الصورة تلقائيًا قبل الرفع.
          </p>
          {value && (
            <p className="text-xs font-medium text-emerald-700">
              الصورة الجديدة جاهزة للحفظ ({formatFileSize(value.size)})
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
