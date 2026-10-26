/** Photos are resized so the longest side is at most this many pixels before upload. */
const MAX_SIDE = 1600;
/** Smaller photos are sent as they are. */
const COMPRESS_ABOVE_BYTES = 400 * 1024;

/**
 * Client-side compression for photo evidence (F18, low bandwidth): JPEG and PNG photos larger
 * than COMPRESS_ABOVE_BYTES are redrawn at most MAX_SIDE pixels wide or tall and re-encoded as
 * JPEG (quality 0.8). PDFs, WebP and small images are returned unchanged, as is anything the
 * browser cannot decode or that would not get smaller.
 */
export async function compressImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size <= COMPRESS_ABOVE_BYTES) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // White background so transparent PNG areas don't turn black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
