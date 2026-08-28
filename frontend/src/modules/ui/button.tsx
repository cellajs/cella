import { cva, type VariantProps } from 'class-variance-authority';
import { t } from 'i18next';
import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Slot } from '~/modules/ui/slot';
import { cn } from '~/utils/cn';

export const buttonVariants = cva(
  'focus-effect inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium text-sm shadow-xs transition-colors disabled:pointer-events-none disabled:opacity-50 [&:not(.absolute):not(.relative)]:active:translate-y-[.05rem]',
  {
    variants: {
      variant: {
        default: '[--intent-color:var(--primary)]',
        brand: '[--intent-color:var(--brand)]',
        destructive: '[--intent-color:var(--destructive)]',
        success: '[--intent-color:var(--success)]',
        secondary:
          'border border-transparent bg-secondary text-secondary-foreground [--intent-color:var(--secondary)] hover:bg-secondary/80',
        outline:
          'border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:hover:bg-input/50',
        ghost: 'shadow-none hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        outlineGhost:
          'border border-foreground/20 bg-background/20 shadow-none hover:border-foreground/30 hover:bg-background/40 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 shadow-none hover:underline',
        cell: 'group flex w-full justify-start gap-2 font-normal text-regular underline-offset-4 opacity-75 shadow-none hover:opacity-100 focus-visible:ring-transparent focus-visible:ring-offset-transparent',
        plain: 'border border-primary/20 bg-primary/5 text-primary hover:border-primary/30 hover:bg-primary/10',
        input:
          'hover:transparent border border-input bg-background aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&:not(.absolute)]:active:translate-y-0',
        warning: '[--intent-color:var(--warning)]',
        none: 'border-none bg-transparent shadow-none',
      },
      soft: {
        true: '',
        false: '',
      },
      size: {
        default: 'h-10 px-3 py-2',
        micro: 'h-6 rounded-md p-1 text-xs',
        xs: 'h-8 rounded-md px-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-4',
        icon: 'h-10 w-10',
        cell: 'h-full px-0 py-0',
        xl: 'h-14 rounded-lg px-6 text-lg',
        auto: 'h-auto',
      },
    },
    // Solid intent fills are gated on `soft: false`: `.soft-text` sorts before `.text-*` in the compiled
    // sheet, so a variant that also emitted `text-<intent>-foreground` would wash out its soft form.
    compoundVariants: [
      // Only intent variants have a soft form; surface-colored ones (`secondary`) would paint `soft-text` near-invisible.
      {
        variant: ['default', 'brand', 'destructive', 'success', 'warning'],
        soft: true,
        // The strong steps (not plain soft-bg) so the button stays legible on a soft-tinted surface;
        // hover deepens all three: fill, text and frame.
        className:
          'soft-bg-strong soft-border-medium hover:soft-bg-stronger hover:soft-border-strong soft-text-strong hover:soft-text-stronger border shadow-none',
      },
      { variant: 'default', soft: false, className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
      { variant: 'brand', soft: false, className: 'bg-brand text-brand-foreground hover:bg-brand/80' },
      {
        variant: 'destructive',
        soft: false,
        className: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
      },
      { variant: 'success', soft: false, className: 'bg-success text-success-foreground hover:bg-success/80' },
      { variant: 'warning', soft: false, className: 'bg-warning text-warning-foreground hover:bg-warning/80' },
    ],
    defaultVariants: {
      variant: 'default',
      soft: false,
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  render?: React.ReactElement;
}

export function Button({
  className,
  variant,
  soft,
  size,
  render,
  loading: _loading,
  children,
  ...props
}: React.ComponentProps<'button'> & ButtonProps) {
  const computedProps = {
    'data-slot': 'button',
    className: cn(buttonVariants({ variant, soft, size, className })),
    ...props,
  };

  if (render) {
    return <Slot {...computedProps}>{React.cloneElement(render, undefined, children)}</Slot>;
  }

  return <button {...computedProps}>{children}</button>;
}

type SubmitButtonProps = Omit<ButtonProps, 'type'> & {
  allowOfflineDelete?: boolean;
  icon?: React.ReactNode;
};

/** Form submit button that warns when offline; `icon` swaps to a spinner on loading, otherwise the spinner overlays the button. */
export function SubmitButton({
  onClick,
  children,
  allowOfflineDelete = false,
  loading,
  disabled,
  icon,
  className,
  ...props
}: SubmitButtonProps) {
  const isOnline = useOnlineManager();

  const isDisabled = disabled || loading;
  const showOfflineWarning = !allowOfflineDelete && !isOnline;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    if (showOfflineWarning) {
      e.preventDefault();
      return toaster.warning(t('c:action.offline.text'));
    }
    onClick?.(e);
  };

  const resolvedIcon = loading ? (
    <LoaderCircleIcon className="animate-spin" />
  ) : showOfflineWarning ? (
    <TriangleAlertIcon />
  ) : (
    icon
  );

  const buttonContent = (
    <Button
      type="submit"
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(icon && 'gap-2', className)}
      {...props}
    >
      {icon ? (
        <>
          {resolvedIcon}
          {children}
        </>
      ) : loading ? (
        <span className="relative inline-flex items-center">
          <span className="invisible">{children}</span>
          <LoaderCircleIcon className="absolute inset-0 m-auto animate-spin" />
        </span>
      ) : (
        <>
          {showOfflineWarning && <TriangleAlertIcon className="mr-2" />}
          {children}
        </>
      )}
    </Button>
  );

  return showOfflineWarning ? (
    <TooltipButton toolTipContent={t('c:offline.text_with_info')}>{buttonContent}</TooltipButton>
  ) : (
    buttonContent
  );
}
