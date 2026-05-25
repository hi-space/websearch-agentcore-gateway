import React, { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hint?: string;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', hint, invalid, id, ...props }, ref) => {
    const ariaDescribedBy = hint && id ? `${id}-hint` : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        <input
          ref={ref}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          {...props}
          className={[
            'h-11 px-4 rounded-md text-body-md bg-surface text-ink placeholder:text-muted',
            'border outline-none transition-colors',
            invalid
              ? 'border-error focus:border-error focus:ring-2 focus:ring-error/20'
              : 'border-hairlineStrong focus:border-ink focus:ring-2 focus:ring-ink/10',
            'disabled:bg-surfaceMuted disabled:text-muted',
            className
          ].join(' ')}
        />
        {hint && (
          <span id={ariaDescribedBy} className={`text-caption ${invalid ? 'text-error' : 'text-body'}`}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
