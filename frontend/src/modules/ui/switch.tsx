'use client';

import * as SwitchPrimitives from '@radix-ui/react-switch';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/utils/cn';

export const switchVariants = cva(
  'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
  {
    variants: {
      size: {
        xs: 'h-4 w-8',
        sm: 'h-5 w-10',
        base: 'h-6 w-11',
        lg: 'h-7 w-12',
      },
    },
    defaultVariants: { size: 'base' },
  },
);

const switchThumbVariants = cva(
  'pointer-events-none block rounded-full ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
  {
    variants: {
      size: { xs: 'h-3 w-3 data-[state=checked]:translate-x-4', sm: 'h-4 w-4', base: 'h-5 w-5', lg: 'h-6 w-6' },
      bg: {
        none: 'bg-transparent',
        default: 'bg-background',
      },
    },
    defaultVariants: { size: 'base', bg: 'default' },
  },
);

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>, VariantProps<typeof switchVariants> {
  thumb?: React.ReactElement;
}

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, SwitchProps>(({ className, size, thumb, ...props }, ref) => {
  const thumbElement = (
    <SwitchPrimitives.Thumb className={cn(switchThumbVariants({ size, bg: thumb ? 'none' : 'default' }))}>
      {thumb &&
        React.cloneElement(thumb, {
          className: cn(switchThumbVariants({ size, bg: 'none' }), thumb.props.className),
        })}
    </SwitchPrimitives.Thumb>
  );
  return (
    <SwitchPrimitives.Root className={cn(switchVariants({ size, className }))} {...props} ref={ref}>
      {thumbElement}
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
