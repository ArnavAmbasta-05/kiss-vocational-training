import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';
import { Field } from './Field';
import { controlClass, describedBy } from './fieldUtils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, required, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field id={inputId} label={label} hint={hint} error={error} required={required}>
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClass, error ? 'border-red-600' : 'border-slate-400', className)}
        {...rest}
      />
    </Field>
  );
});
