import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '~/utils/cn';

const toggleVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-effect disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground shadow-xs active:translate-y-[.05rem]',
  {
    variants: {
      variant: {
        default: 'bg-transparent shadow-none',
        outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        tile: 'bg-transparent text-left border hover:bg-accent/50 hover:text-accent-foreground group p-3',
        merged:
          'border border-input bg-transparent hover:bg-accent/50 hover:text-accent-foreground rounded-none border-r-0 first:rounded-l-md last:rounded-r-md last:border-r',
      },
      size: {
        default: 'h-10 px-3',
        xs: 'h-7 px-2',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5',
        tile: 'h-full w-full !rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
  );
}
export { Toggle, toggleVariants };
