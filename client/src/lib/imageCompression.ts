/**
 * Image compression utility for worker photos.
 * The original source image is processed locally in the browser before upload.
 */

import { WORKER_PHOTO_POLICY } from '@shared/workerPhotoPolicy';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

const defaultOptions: CompressionOptions = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.8,
  mimeType: 'image/jpeg',
};

/**
 * Compress an image file.
 * Drawing it onto a new canvas also strips the original EXIF/GPS metadata.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...defaultOptions, ...options };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('تعذر تجهيز الصورة'));
          return;
        }

        let { width, height } = img;
        const maxWidth = opts.maxWidth!;
        const maxHeight = opts.maxHeight!;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        // Worker photos are opaque profile images. A white background keeps
        // transparent PNGs predictable when converted to WebP.
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('تعذر ضغط الصورة'));
            }
          },
          opts.mimeType,
          opts.quality
        );
      };

      img.onerror = () => reject(new Error('تعذر قراءة الصورة'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });
}

export async function compressImageToFile(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const blob = await compressImage(file, options);
  const extension = options.mimeType?.split('/')[1] || 'jpeg';
  const fileName = file.name.replace(/\.[^/.]+$/, `.${extension}`);

  return new File([blob], fileName, {
    type: options.mimeType || 'image/jpeg',
    lastModified: Date.now(),
  });
}

/**
 * Prepare a worker photo using the approved policy:
 * - original <= 15 MB
 * - JPG/JPEG, PNG or WebP input
 * - final format WebP
 * - max dimensions 800x800
 * - aim for <= 1000 KB, never allow > 1300 KB
 */
export async function prepareWorkerPhoto(file: File): Promise<File> {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'الصورة غير صالحة');
  }

  let quality = WORKER_PHOTO_POLICY.initialQuality;
  let blob = await compressImage(file, {
    maxWidth: WORKER_PHOTO_POLICY.maxWidth,
    maxHeight: WORKER_PHOTO_POLICY.maxHeight,
    quality,
    mimeType: WORKER_PHOTO_POLICY.outputMimeType,
  });

  // Gradually reduce quality only when needed. Most profile photos will be
  // much smaller than the target after the 800x800 resize.
  while (
    blob.size > WORKER_PHOTO_POLICY.targetBytes &&
    quality - WORKER_PHOTO_POLICY.qualityStep >= WORKER_PHOTO_POLICY.minQuality
  ) {
    quality = Math.max(
      WORKER_PHOTO_POLICY.minQuality,
      quality - WORKER_PHOTO_POLICY.qualityStep
    );
    blob = await compressImage(file, {
      maxWidth: WORKER_PHOTO_POLICY.maxWidth,
      maxHeight: WORKER_PHOTO_POLICY.maxHeight,
      quality,
      mimeType: WORKER_PHOTO_POLICY.outputMimeType,
    });
  }

  if (blob.type !== WORKER_PHOTO_POLICY.outputMimeType) {
    throw new Error('المتصفح لا يدعم تحويل الصورة إلى WebP');
  }

  if (blob.size > WORKER_PHOTO_POLICY.hardMaxBytes) {
    throw new Error('تعذر ضغط الصورة ضمن الحد النهائي المسموح (1300 KB)');
  }

  return new File([blob], `worker-photo-${Date.now()}.webp`, {
    type: WORKER_PHOTO_POLICY.outputMimeType,
    lastModified: Date.now(),
  });
}

export async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('تعذر تجهيز الصورة للرفع'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error('تعذر تجهيز الصورة للرفع'));
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function isImageFile(file: File): boolean {
  return (WORKER_PHOTO_POLICY.acceptedInputMimeTypes as readonly string[]).includes(file.type);
}

export function validateImageFile(
  file: File,
  maxSizeMB: number = WORKER_PHOTO_POLICY.originalMaxBytes / (1024 * 1024)
): { valid: boolean; error?: string } {
  if (!isImageFile(file)) {
    return { valid: false, error: 'الصيغ المسموحة: JPG أو JPEG أو PNG أو WebP' };
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: `حجم الصورة الأصلية يجب ألا يتجاوز ${maxSizeMB} ميجابايت` };
  }

  return { valid: true };
}
