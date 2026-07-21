import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        brand: 'bg-brand text-brand-foreground [--intent-color:var(--brand)]',
        destructive: 'bg-destructive text-destructive-foreground [--intent-color:var(--destructive)]',
        success: 'bg-success text-success-foreground [--intent-color:var(--success)]',
        plain: 'border-primary/20 bg-background/80 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        warning: 'bg-warning text-warning-foreground [--intent-color:var(--warning)]',
      },
      soft: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      {
        variant: ['brand', 'destructive', 'success', 'warning'],
        soft: true,
        className: 'soft-bg soft-border soft-text',
      },
    ],
    defaultVariants: {
      variant: 'default',
      soft: true,
    },
  },
);

export function Alert({
  className,
  variant,
  soft,
  onClose,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & { onClose?: () => void }) {
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant, soft }), className)} {...props}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="focus-effect absolute top-2 right-2 rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 disabled:pointer-events-none"
        >
          <XIcon className="size-5" strokeWidth={1.5} />
          <span className="sr-only">Close</span>
        </button>
      )}
      {children}
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 w-full justify-items-start gap-1 text-sm', className)}
      {...props}
    />
  );
}
