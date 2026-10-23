import { api } from './api/client';

/**
 * GETs a file with the user's in-memory token (a plain link would carry no auth) and hands it
 * to the browser as a download.
 */
export async function downloadFile(path: string, filename: string) {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
