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
            'h-12 px-4 rounded-xl text-body-md bg-surface text-onBackground placeholder:text-stone',
            'border outline-none transition-colors',
            invalid
              ? 'border-error focus:border-error focus:ring-2 focus:ring-error/20'
              : 'border-outline focus:border-primary focus:ring-2 focus:ring-primary/15',
            'disabled:bg-background disabled:text-muted',
            className
          ].join(' ')}
        />
        {hint && (
          <span id={ariaDescribedBy} className={`text-caption ${invalid ? 'text-error' : 'text-slate'}`}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
