import { useEffect, useState } from 'react';

const PREFIX = 'vtmp.pref.';

function read<T>(key: string, fallback: T, isValid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    // Private mode, blocked storage or a corrupt value: use the default.
    return fallback;
  }
}

/**
 * useState that this device remembers (filters, view choices). Only for conveniences: values
 * stay in this browser, never hold personal data, and fall back to the default when storage is
 * unavailable or the stored value is no longer valid.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid: (v: unknown) => v is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback, isValid));
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the choice simply isn't remembered.
    }
  }, [key, value]);
  return [value, setValue];
}

/** Validator for a value that must be one of a fixed list (e.g. a filter option). */
export function oneOf<T extends string | number | boolean>(...options: readonly T[]) {
  return (v: unknown): v is T => options.includes(v as T);
}
