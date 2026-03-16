import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Slot } from '~/modules/ui/slot';
import { cn } from '~/utils/cn';

export const badgeVariants = cva(
  'flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-effect aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] shadow-xs overflow-hidden',
  {
    variants: {
      variant: {
        default:
          '[--intent-color:var(--primary)] border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        brand: '[--intent-color:var(--brand)] border-transparent bg-brand text-brand-foreground [a&]:hover:bg-brand/90',
        success: '[--intent-color:var(--success)] border-transparent bg-success text-success-foreground',
        secondary:
          '[--intent-color:var(--secondary)] border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        plain: 'text-primary bg-primary/5 border border-primary/20',
        destructive:
          '[--intent-color:var(--destructive)] border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        warning: '[--intent-color:var(--warning)] border-transparent bg-warning text-warning-foreground',
      },
      soft: {
        true: 'soft-bg text-(--intent-color) soft-border shadow-none',
        false: '',
      },
      size: {
        micro: 'text-[10px] h-4 py-0',
        xs: 'text-xs h-5',
        sm: 'text-xs h-6',
        md: 'text-sm h-7',
        lg: 'text-base h-10',
        xl: 'text-lg h-12',
      },
      context: {
        button: 'py-0 px-1 absolute -right-1.5 min-w-5 flex justify-center -top-1.5 animate-in zoom-in shadow-md',
        none: 'lowercase',
      },
    },
    defaultVariants: {
      variant: 'default',
      soft: false,
      size: 'xs',
      context: 'none',
    },
  },
);

export function Badge({
  className,
  variant,
  soft,
  context,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, soft, size, context }), className)} {...props} />
  );
}
