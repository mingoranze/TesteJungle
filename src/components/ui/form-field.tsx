import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldInputClass = 'h-10 w-full rounded-[2px] border border-border bg-[#140c09] px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-secondary/80 hover:border-primary/70 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary aria-invalid:border-error disabled:opacity-60';

interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  /** Rótulo apenas para tecnologia assistiva quando o layout não exibe rótulo visível. */
  hideLabel?: boolean;
  className?: string;
  labelClassName?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean | undefined;
    'aria-describedby': string | undefined;
    'aria-required': boolean | undefined;
  }) => React.ReactNode;
}

/** Campo de formulário com rótulo, indicador obrigatório e mensagem de erro associada. */
export function FormField({ id, label, required, error, hideLabel, className, labelClassName, children }: FormFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className={cn('mb-3 block font-mono text-[15px] text-foreground', labelClassName, hideLabel && 'sr-only')}>
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-[#e8794f]">*</span>}
        {required && <span className="sr-only"> (obrigatório)</span>}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
        'aria-required': required || undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1.5 font-mono text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
