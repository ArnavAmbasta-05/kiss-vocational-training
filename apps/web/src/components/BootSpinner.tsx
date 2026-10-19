/** Shown while the first locale files load; deliberately text-free so it needs no translation. */
export function BootSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" aria-busy="true">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-brand-600" />
    </div>
  );
}
