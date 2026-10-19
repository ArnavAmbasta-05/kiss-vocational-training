import { useTranslation } from 'react-i18next';
import { cn } from './cn';

interface SpinnerProps {
  /** Accessible label; defaults to "Loading…". */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-4' };

export function Spinner({ label, size = 'md', className }: SpinnerProps) {
  const { t } = useTranslation();
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <span
        aria-hidden="true"
        className={cn('animate-spin rounded-full border-slate-300 border-t-brand-600', sizes[size])}
      />
      <span className="sr-only">{label ?? t('loading')}</span>
    </span>
  );
}
