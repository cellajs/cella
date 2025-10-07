import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { t } from 'i18next';
import { Loader2, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { toaster } from '~/modules/common/toaster/service';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { cn } from '~/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-effect disabled:pointer-events-none [&:not(.absolute)]:active:translate-y-[.05rem] disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
        success: 'bg-success text-primary-foreground hover:bg-success/80',
        secondary: 'bg-secondary border border-transparent text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent/50',
        outlineGhost: 'border border-foreground/20 bg-background/20 hover:bg-background/40 hover:border-foreground/30 hover:text-accent-foreground',
        outlinePrimary: 'text-primary border border-primary/30 bg-background/20 hover:bg-primary/5 hover:border-primary/50',
        link: 'text-primary underline-offset-4 hover:underline',
        // Add more variants here
        darkSuccess: 'bg-green-700 text-white hover:bg-green-700/80',
        cell: 'text-regular underline-offset-4 hover:underline focus-visible:ring-offset-transparent focus-visible:ring-transparent opacity-75 hover:opacity-100',
        plain: 'text-primary bg-primary/5 border border-primary/30 hover:bg-primary/10 hover:border-primary/50',
        input: 'border border-input bg-background [&:not(.absolute)]:active:translate-y-0 hover:transparent',
        none: 'bg-transparent border-none',
      },
      size: {
        default: 'h-10 px-3 py-2',
        micro: 'h-6 p-1 rounded-md text-xs',
        xs: 'h-8 px-2 rounded-md',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-4',
        icon: 'h-10 w-10',
        xl: 'h-14 rounded-lg text-lg px-6',
        auto: 'h-auto',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

type SubmitButtonProps = Omit<ButtonProps, 'type'> & {
  allowOfflineDelete?: boolean;
};

/**
 * Submit button for forms that warns when offline.
 */
function SubmitButton({ onClick, children, allowOfflineDelete = false, loading, disabled, ...props }: SubmitButtonProps) {
  const { isOnline } = useOnlineManager();

  const isDisabled = disabled || loading;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    if (!allowOfflineDelete && !isOnline) {
      e.preventDefault();
      return toaster(t('common:action.offline.text'), 'warning');
    }
    onClick?.(e);
  };

  const buttonContent = (
    <Button type="submit" onClick={handleClick} disabled={isDisabled} aria-busy={loading || undefined} {...props}>
      {loading ? (
        <Loader2 className="mr-2 animate-spin" size={16} />
      ) : (
        !allowOfflineDelete && !isOnline && <TriangleAlert className="mr-2" size={16} />
      )}
      {children}
    </Button>
  );

  return !allowOfflineDelete && !isOnline ? (
    <TooltipButton toolTipContent={t('common:offline.text_with_info')}>{buttonContent}</TooltipButton>
  ) : (
    buttonContent
  );
}

export { Button, buttonVariants, SubmitButton };
