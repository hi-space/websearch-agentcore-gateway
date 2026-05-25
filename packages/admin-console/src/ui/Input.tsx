import React, { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hint?: string;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', hint, invalid, id, ...props }, ref) => {
    const ariaDescribedBy = hint && id ? `${id}-hint` : undefined;
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={ref}
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          {...props}
          className={[
            'h-11 px-4 rounded-md text-body-md bg-canvas text-ink placeholder:text-stone',
            'border outline-none transition-colors',
            invalid
              ? 'border-semanticError focus:border-semanticError focus:ring-2 focus:ring-semanticError/20'
              : 'border-hairlineStrong focus:border-primary focus:ring-2 focus:ring-primary/15',
            'disabled:bg-surface disabled:text-muted',
            className
          ].join(' ')}
        />
        {hint && (
          <span id={ariaDescribedBy} className={`text-caption ${invalid ? 'text-semanticError' : 'text-steel'}`}>
            {hint}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
