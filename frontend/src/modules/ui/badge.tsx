import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils/cn';

export const badgeVariants = cva(
  'focus-effect flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs shadow-xs transition-[color,box-shadow] aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'intent-primary border-transparent',
        brand: 'intent-brand border-transparent',
        success: 'intent-success border-transparent',
        secondary: 'intent-secondary border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        plain: 'border border-primary/20 bg-primary/5 text-primary',
        destructive: 'intent-destructive border-transparent focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        warning: 'intent-warning border-transparent',
      },
      soft: { true: '', false: '' },
      size: {
        micro: 'h-4 py-0 text-2xs',
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
    // Solid fills gated on `soft: false`, so the soft form never emits `text-<intent>-foreground`
    compoundVariants: [
      // Soft form limited to intent variants
      { variant: ['default', 'brand', 'success', 'destructive', 'warning'], soft: true, className: 'soft-bg soft-border soft-text shadow-none' },
      { variant: 'default', soft: false, className: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90' },
      { variant: 'brand', soft: false, className: 'bg-brand text-brand-foreground [a&]:hover:bg-brand/90' },
      { variant: 'success', soft: false, className: 'bg-success text-success-foreground' },
      {
        variant: 'destructive',
        soft: false,
        className: 'bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90',
      },
      { variant: 'warning', soft: false, className: 'bg-warning text-warning-foreground' },
    ],
    defaultVariants: { variant: 'default', soft: false, size: 'xs', context: 'none' },
  },
);

export function Badge({
  className,
  variant,
  soft,
  context,
  size,
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: { 'data-slot': 'badge', className: cn(badgeVariants({ variant, soft, size, context }), className), ...props },
  });
}
