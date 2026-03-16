import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '~/utils/cn';

export const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        brand: '[--intent-color:var(--brand)] bg-brand text-brand-foreground',
        destructive: '[--intent-color:var(--destructive)] bg-destructive text-destructive-foreground',
        success: '[--intent-color:var(--success)] bg-success text-success-foreground',
        plain: 'text-primary bg-background/80 border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground',
        warning: '[--intent-color:var(--warning)] bg-warning text-warning-foreground',
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
<<<<<<< HEAD
        className: 'soft-bg text-(--intent-color) soft-border',
=======
        className: 'bg-(--intent-color)/10 text-(--intent-color) border-(--intent-color)/20',
>>>>>>> cella-upstream/development
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
          className="absolute top-2 right-2 p-1 rounded-sm opacity-70 transition-opacity hover:opacity-100 hover:bg-accent focus-effect disabled:pointer-events-none"
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
    <div data-slot="alert-description" className={cn('justify-items-start gap-1 text-sm', className)} {...props} />
  );
}
