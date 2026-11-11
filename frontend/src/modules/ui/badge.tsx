import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils/cn';

export const badgeVariants = cva(
  'focus-effect aria-invalid:border-destructive flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'intent-primary border-transparent',
        brand: 'intent-brand border-transparent',
        success: 'intent-success border-transparent',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-muted-hover border-transparent',
        destructive: 'intent-destructive border-transparent',
        outline: 'text-foreground [a&]:hover:bg-hover [a&]:hover:text-foreground',
        warning: 'intent-warning border-transparent',
      },
      soft: { true: '', false: '' },
      size: { micro: 'text-2xs h-4 py-0', xs: 'h-5', sm: 'h-6', md: 'h-7 text-sm', lg: 'h-10 text-base', xl: 'h-12 text-lg' },
      context: {
        button:
          'absolute -top-1.5 -right-1.5 min-w-5 px-1 py-0 shadow-md transition-transform duration-150 ease-out motion-reduce:transition-none starting:scale-0',
        none: '',
      },
    },
    compoundVariants: [
      { variant: ['default', 'brand', 'success', 'destructive', 'warning'], soft: true, className: 'soft-bg soft-border soft-text' },
      { variant: 'default', soft: false, className: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90' },
      { variant: 'brand', soft: false, className: 'bg-brand text-brand-foreground [a&]:hover:bg-brand/90' },
      { variant: 'success', soft: false, className: 'bg-success text-success-foreground' },
      { variant: 'destructive', soft: false, className: 'bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90' },
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
