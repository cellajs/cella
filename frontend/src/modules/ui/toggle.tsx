import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '~/utils/cn';

export const toggleVariants = cva(
  'focus-effect inline-flex items-center justify-center rounded-md font-medium text-sm shadow-xs transition-colors hover:bg-muted hover:text-muted-foreground active:translate-y-[.05rem] disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-accent data-pressed:text-accent-foreground',
  {
    variants: {
      variant: {
        default: 'bg-transparent shadow-none',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        tile: 'group border bg-transparent p-3 text-left hover:bg-accent/50 hover:text-accent-foreground',
        merged:
          'rounded-none border border-input border-r-0 bg-transparent first:rounded-l-md last:rounded-r-md last:border-r hover:bg-accent/50 hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-3',
        xs: 'h-7 px-2',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
        tile: '!rounded-xl h-full w-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export function Toggle({
  className,
  variant,
  size,
  value,
  ...props
}: Omit<React.ComponentProps<typeof TogglePrimitive>, 'value'> &
  VariantProps<typeof toggleVariants> & { value?: string | number | readonly string[] }) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      value={value != null ? String(value) : undefined}
      {...props}
    />
  );
}
