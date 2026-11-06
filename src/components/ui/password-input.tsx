import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  /** Exibe o botão de alternância de visibilidade. */
  toggleable?: boolean;
  toggleClassName?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleable = true, toggleClassName, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn(toggleable && 'pr-11', className)}
          {...props}
        />
        {toggleable && (
          <button
            type="button"
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={visible}
            onClick={() => setVisible((value) => !value)}
            className={cn(
              'absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded text-secondary hover:text-primary',
              toggleClassName,
            )}
          >
            {visible
              ? <Eye aria-hidden="true" size={18} />
              : <EyeOff aria-hidden="true" size={18} />}
          </button>
        )}
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
