import { useState } from 'react';
import { User, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface WorkerPhotoPreviewProps {
  src?: string | null;
  workerName: string;
  className?: string;
  fallbackIconClassName?: string;
  roundedClassName?: string;
  enablePreview?: boolean;
}

export default function WorkerPhotoPreview({
  src,
  workerName,
  className = 'h-24 w-24',
  fallbackIconClassName = 'h-10 w-10',
  roundedClassName = 'rounded-xl',
  enablePreview = true,
}: WorkerPhotoPreviewProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const canOpen = Boolean(src && enablePreview);

  return (
    <>
      <button
        type="button"
        onClick={() => canOpen && setIsPreviewOpen(true)}
        disabled={!canOpen}
        aria-label={canOpen ? `عرض صورة ${workerName} بحجم أكبر` : `لا توجد صورة للعامل ${workerName}`}
        title={canOpen ? 'اضغط لعرض الصورة بحجم أكبر' : undefined}
        className={cn(
          'relative shrink-0 overflow-hidden border-2 border-border bg-muted transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          roundedClassName,
          className,
          canOpen ? 'cursor-zoom-in hover:shadow-md group' : 'cursor-default'
        )}
      >
        {src ? (
          <img
            src={src}
            alt={workerName}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-muted">
            <User className={cn('text-muted-foreground', fallbackIconClassName)} />
          </span>
        )}
        {canOpen && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
            <Maximize2 className="h-5 w-5 text-white drop-shadow" />
          </span>
        )}
      </button>

      {src && (
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="sm:max-w-4xl" dir="rtl">
            <DialogHeader>
              <DialogTitle>صورة العامل</DialogTitle>
              <DialogDescription>{workerName}</DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[75vh] min-h-48 items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2">
              <img
                src={src}
                alt={workerName}
                className="max-h-[70vh] max-w-full rounded-md object-contain"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
