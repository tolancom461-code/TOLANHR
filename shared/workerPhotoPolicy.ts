/**
 * Worker photo policy shared by client and server.
 *
 * The original image never leaves the browser. The client converts it to WebP
 * before upload, and the server accepts only the final WebP payload.
 */
export const WORKER_PHOTO_POLICY = {
  originalMaxBytes: 15 * 1024 * 1024,
  targetBytes: 1000 * 1024,
  hardMaxBytes: 1300 * 1024,
  maxWidth: 800,
  maxHeight: 800,
  initialQuality: 0.82,
  minQuality: 0.55,
  qualityStep: 0.07,
  outputMimeType: 'image/webp' as const,
  acceptedInputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
};

export const WORKER_PHOTO_MANAGE_ROLES = [
  'admin_affairs',
  'data_entry',
  'accountant',
  'super_admin',
] as const;

/**
 * Owner/admin accounts are normally normalized to super_admin by the current
 * authentication flow. `isOwner` remains an explicit override so the photo
 * feature cannot accidentally lock out the configured owner if their stored
 * role is ever inconsistent.
 */
export function canManageWorkerPhotos(
  role?: string | null,
  isOwner: boolean = false
): boolean {
  if (isOwner) return true;
  if (!role) return false;
  return (WORKER_PHOTO_MANAGE_ROLES as readonly string[]).includes(role);
}
