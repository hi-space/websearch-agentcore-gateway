import React, { forwardRef, type InputHTMLAttributes } from 'react';

// Nike inputs follow the search-pill spec: soft-cloud fill, 24px (rounded-md)
// pill, ink-on-soft-cloud body. Focus inverts to canvas + ink border.

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
            'h-12 px-4 rounded-md text-body-md bg-surfaceSoft text-ink placeholder:text-muted',
            'border outline-none transition-colors',
            invalid
              ? 'border-error focus:border-error focus:bg-canvas focus:ring-2 focus:ring-error/20'
              : 'border-transparent focus:bg-canvas focus:border-ink focus:ring-2 focus:ring-ink/10',
            'disabled:opacity-60 disabled:bg-surfaceSoft disabled:text-muted',
            className
          ].join(' ')}
        />
        {hint && (
          <span id={ariaDescribedBy} className={`text-caption ${invalid ? 'text-error' : 'text-muted'}`}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
