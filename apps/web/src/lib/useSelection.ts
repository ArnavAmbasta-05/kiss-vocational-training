import { useCallback, useState } from 'react';

/** Row selection for bulk actions: toggle one, toggle all visible, clear. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const toggleAll = useCallback(
    (ids: string[]) =>
      setSelected((s) =>
        ids.length > 0 && ids.every((id) => s.has(id)) ? new Set() : new Set(ids),
      ),
    [],
  );
  return { selected, toggle, toggleAll, clear };
}
