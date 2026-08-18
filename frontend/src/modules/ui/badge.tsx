import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Slot } from '~/modules/ui/slot';
import { cn } from '~/utils/cn';

export const badgeVariants = cva(
  'focus-effect flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs shadow-xs transition-[color,box-shadow] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [--intent-color:var(--primary)] [a&]:hover:bg-primary/90',
        brand: 'border-transparent bg-brand text-brand-foreground [--intent-color:var(--brand)] [a&]:hover:bg-brand/90',
        success: 'border-transparent bg-success text-success-foreground [--intent-color:var(--success)]',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [--intent-color:var(--secondary)] [a&]:hover:bg-secondary/90',
        plain: 'border border-primary/20 bg-primary/5 text-primary',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground [--intent-color:var(--destructive)] focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground [--intent-color:var(--warning)]',
      },
      soft: {
        true: 'soft-bg soft-border soft-text shadow-none',
        false: '',
      },
      size: {
        micro: 'h-4 py-0 text-[10px]',
        xs: 'h-5 text-xs',
        sm: 'h-6 text-xs',
        md: 'h-7 text-sm',
        lg: 'h-10 text-base',
        xl: 'h-12 text-lg',
      },
      context: {
        button: 'zoom-in absolute -top-1.5 -right-1.5 flex min-w-5 animate-in justify-center px-1 py-0 shadow-md',
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
  render,
  children,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { render?: React.ReactElement }) {
  const computedProps = {
    'data-slot': 'badge',
    className: cn(badgeVariants({ variant, soft, size, context }), className),
    ...props,
  };

  if (render) {
    return <Slot {...computedProps}>{React.cloneElement(render, undefined, children)}</Slot>;
  }

  return <span {...computedProps}>{children}</span>;
}
