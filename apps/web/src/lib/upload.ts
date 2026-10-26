import type { UploadTarget } from '@vtmp/shared';

/**
 * Sends a file straight to the store (never through the API) using a one-file target the API
 * handed out: Vercel Blob in production, the local driver's signed PUT in development.
 */
export async function uploadToTarget(target: UploadTarget, file: File): Promise<string> {
  if (target.driver === 'vercel-blob') {
    // Loaded only when needed: the Blob client is not part of the main bundle.
    const { put } = await import('@vercel/blob/client');
    await put(target.key, file, {
      access: 'private',
      token: target.clientToken,
      contentType: file.type,
    });
  } else {
    const res = await fetch(target.url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  }
  return target.key;
}
