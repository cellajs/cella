import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircleIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export const buttonVariants = cva(
  'focus-effect inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm shadow-xs transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'intent-primary',
        brand: 'intent-brand',
        destructive: 'intent-destructive',
        success: 'intent-success',
        secondary: 'border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground dark:border-input dark:hover:bg-input/50',
        // Ghost has no surface of its own, so its hover is a share of the text color: it shows on any backdrop, in both modes
        ghost: 'shadow-none hover:bg-foreground/8 hover:text-accent-foreground',
        outlineGhost:
          'border border-foreground/20 bg-background/20 shadow-none hover:border-foreground/30 hover:bg-background/40 hover:text-accent-foreground',
        link: 'link-inline text-primary shadow-none',
        cell: 'group/cell-button flex w-full justify-start font-normal opacity-75 shadow-none hover:opacity-100 focus-visible:ring-transparent focus-visible:ring-offset-transparent',
        plain: 'intent-primary soft-bg soft-border hover:soft-bg-strong hover:soft-border-medium border text-primary',
        input:
          'border border-input bg-background aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        warning: 'intent-warning',
        none: 'border-none bg-transparent shadow-none',
      },
      soft: { true: '', false: '' },
      // Nudges the button down while held; input-styled buttons stay put like the fields they sit among
      press: { true: 'active:press', false: '' },
      size: {
        default: 'h-10 px-3 py-2',
        micro: 'h-6 gap-1 p-1 text-xs',
        xs: 'h-8 gap-1.5 px-2',
        sm: 'h-9 gap-1.5 px-3',
        lg: 'h-11 px-4',
        xl: 'h-14 rounded-lg px-6 text-lg',
        icon: 'size-10',
        cell: 'h-full px-0 py-0',
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
        // The strong steps keep the button legible on a soft-tinted surface.
        className:
          'soft-bg-strong soft-border-medium hover:soft-bg-stronger hover:soft-border-strong soft-text-strong hover:soft-text-stronger border shadow-none',
      },
      { variant: 'default', soft: false, className: 'bg-primary text-primary-foreground hover:bg-primary/80' },
      { variant: 'brand', soft: false, className: 'bg-brand text-brand-foreground hover:bg-brand/80' },
      { variant: 'destructive', soft: false, className: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
      { variant: 'success', soft: false, className: 'bg-success text-success-foreground hover:bg-success/90' },
      { variant: 'warning', soft: false, className: 'bg-warning text-warning-foreground hover:bg-warning/90' },
    ],
    defaultVariants: { variant: 'default', soft: false, size: 'default', press: true },
  },
);

export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  render?: useRender.RenderProp;
}

/** `loading` disables the button and overlays a spinner, keeping its width and its name; native buttons default to `type="button"`. */
export function Button({ className, variant, soft, size, press, render, loading, disabled, children, ...props }: ButtonProps) {
  const content = loading ? (
    <span className="relative inline-flex items-center justify-center gap-[inherit]">
      <span className="inline-flex items-center gap-[inherit] opacity-0">{children}</span>
      <LoaderCircleIcon className="absolute inset-0 m-auto animate-spin" />
    </span>
  ) : (
    children
  );

  return useRender({
    defaultTagName: 'button',
    render,
    props: {
      // A `render` element such as a Link keeps its own semantics, so only the native button gets a type.
      ...(render ? {} : { type: 'button' }),
      'data-slot': 'button',
      className: cn(buttonVariants({ variant, soft, size, press: press ?? variant !== 'input', className })),
      disabled: disabled || loading,
      'aria-busy': loading || undefined,
      ...props,
      children: content,
    },
  });
}
