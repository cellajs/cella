import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { createContext, use } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const alertVariants = cva(
  'group/alert relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 sm:has-[>[data-slot=alert-action]]:grid-cols-[auto_1fr_auto] [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive: 'intent-destructive soft-bg soft-border soft-text',
        success: 'intent-success soft-bg soft-border soft-text',
        // Info tints the surface and the icon only: its copy reads at body-text contrast, where a status alert tints its copy too.
        info: 'intent-info soft-bg soft-border text-foreground *:data-[slot=alert-description]:text-foreground-soft [&>svg]:text-info',
        plain: 'border-primary/20 bg-background/80 text-primary',
        warning: 'intent-warning soft-bg soft-border soft-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/** The alert's `onClose`, so `AlertAction` can place the close button in its row. */
const AlertCloseContext = createContext<(() => void) | undefined>(undefined);

function AlertClose({ onClose, className }: { onClose: () => void; className?: string }) {
  const { t } = useTranslation();

  return (
    <Button variant="ghost" size="icon" onClick={onClose} className={className}>
      <XIcon className="size-4" />
      <span className="sr-only">{t('c:close')}</span>
    </Button>
  );
}

/** From `sm` up, an alert with an `AlertAction` shows its close button in the action's row; elsewhere it sits top right. */
export function Alert({
  className,
  variant,
  onClose,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & { onClose?: () => void }) {
  return (
    <AlertCloseContext.Provider value={onClose}>
      <div
        data-slot="alert"
        role="alert"
        className={cn(alertVariants({ variant }), onClose && 'pr-12 sm:has-[>[data-slot=alert-action]]:pr-4', className)}
        {...props}
      >
        {onClose && (
          <AlertClose onClose={onClose} className="absolute top-2.5 right-2.5 size-6 sm:group-has-[>[data-slot=alert-action]]/alert:hidden" />
        )}
        {children}
      </div>
    </AlertCloseContext.Provider>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('wrap-break-word col-start-2 w-full min-w-0 justify-items-start gap-1 text-sm', className)}
      {...props}
    />
  );
}

/**
 * The alert's button or link: beside the text, centered on it, from `sm` up; under the text on a phone. Beside the text
 * it also holds the close button, stretched square to the action's height, so the two always line up.
 */
export function AlertAction({ className, children, ...props }: React.ComponentProps<'div'>) {
  const onClose = use(AlertCloseContext);

  return (
    <div
      data-slot="alert-action"
      // A grid sizes its columns again once the row height is known, which gives the close button's `aspect-square` its width
      className={cn(
        'col-start-2 mt-2 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:ml-3 sm:grid sm:grid-flow-col sm:gap-2 sm:self-center',
        className,
      )}
      {...props}
    >
      {children}
      {onClose && <AlertClose onClose={onClose} className="aspect-square h-full w-auto max-sm:hidden" />}
    </div>
  );
}
