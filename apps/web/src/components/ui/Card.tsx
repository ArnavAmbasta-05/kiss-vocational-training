import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  /** Heading level for the title, so pages keep a correct outline. */
  headingLevel?: 2 | 3 | 4;
  actions?: ReactNode;
}

export function Card({
  title,
  headingLevel = 2,
  actions,
  className,
  children,
  ...rest
}: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5', className)}
      {...rest}
    >
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          {title && <Heading className="text-base font-semibold text-slate-900">{title}</Heading>}
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
