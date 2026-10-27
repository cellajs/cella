import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

export const alertVariants = cva(
  'group/alert relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 sm:has-[>[data-slot=alert-action]]:grid-cols-[auto_1fr_auto] [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        brand: 'intent-brand',
        destructive: 'intent-destructive',
        success: 'intent-success',
        info: 'intent-info',
        plain: 'border-primary/20 bg-background/80 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        warning: 'intent-warning',
      },
      soft: { true: '', false: '' },
    },
    compoundVariants: [
      { variant: ['brand', 'destructive', 'success', 'warning'], soft: true, className: 'soft-bg soft-border soft-text' },
      // Info tints the surface and the icon only: its copy reads at body-text contrast, where a status alert tints its copy too.
      {
        variant: 'info',
        soft: true,
        className: 'soft-bg soft-border text-foreground *:data-[slot=alert-description]:text-foreground-soft [&>svg]:text-info',
      },
      { variant: 'brand', soft: false, className: 'bg-brand text-brand-foreground' },
      { variant: 'destructive', soft: false, className: 'bg-destructive text-destructive-foreground' },
      { variant: 'success', soft: false, className: 'bg-success text-success-foreground' },
      { variant: 'info', soft: false, className: 'bg-info text-info-foreground' },
      { variant: 'warning', soft: false, className: 'bg-warning text-warning-foreground' },
    ],
    defaultVariants: { variant: 'default', soft: true },
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
  const { t } = useTranslation();

  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant, soft }), onClose && 'pr-12', className)} {...props}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="focus-effect absolute top-2 right-2 rounded-sm p-1.5 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 disabled:pointer-events-none sm:group-has-[>[data-slot=alert-action]]/alert:top-1/2 sm:group-has-[>[data-slot=alert-action]]/alert:-translate-y-1/2"
        >
          <XIcon className="size-4" />
          <span className="sr-only">{t('c:close')}</span>
        </button>
      )}
      {children}
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('col-start-2 w-full justify-items-start gap-1 text-sm', className)} {...props} />;
}

/** The alert's button or link: beside the text, centered on it, from `sm` up; under the text on a phone. */
export function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-action"
      className={cn('col-start-2 mt-2 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:ml-3 sm:self-center', className)}
      {...props}
    />
  );
}
