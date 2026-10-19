import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { Field } from './Field';
import { controlClass, describedBy } from './fieldUtils';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, options, hint, error, hideLabel, id, required, className, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const control = (
    <select
      ref={ref}
      id={selectId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(selectId, hint, error)}
      className={cn(controlClass, error ? 'border-red-600' : 'border-slate-400', className)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (hideLabel) {
    return (
      <div>
        <label htmlFor={selectId} className="sr-only">
          {label}
        </label>
        {control}
      </div>
    );
  }
  return (
    <Field id={selectId} label={label} hint={hint} error={error} required={required}>
      {control}
    </Field>
  );
});
