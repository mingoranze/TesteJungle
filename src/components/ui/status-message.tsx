import { cn } from '@/lib/utils';

interface StatusMessageProps {
  children: React.ReactNode;
  role?: 'status' | 'alert';
  variant?: 'neutral' | 'error';
  className?: string;
}

function StatusMessage({
  children,
  role = 'status',
  variant = 'neutral',
  className,
}: StatusMessageProps) {
  return (
    <p
      role={role}
      className={cn(
        'rounded-lg border px-4 py-3 text-sm leading-6',
        variant === 'error'
          ? 'border-error/50 bg-error/10 text-error'
          : 'border-border bg-surface text-secondary',
        className,
      )}
    >
      {children}
    </p>
  );
}

export { StatusMessage };
