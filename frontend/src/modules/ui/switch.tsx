import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import * as React from 'react';
import { cn } from '~/utils/cn';

interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  size?: 'sm' | 'default';
  thumb?: React.ReactElement<{ className?: string }>;
}

export function Switch({ className, size = 'default', thumb, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // Transparent ::after gives the small track a touch-sized hit area.
        'peer group/switch focus-effect relative inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs outline-hidden transition-all data-[size=default]:h-[1.15rem] data-[size=sm]:h-4 data-[size=default]:w-8 data-[size=sm]:w-7 data-disabled:cursor-not-allowed data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-50 data-[size=sm]:after:absolute data-[size=sm]:after:-inset-x-3 data-[size=sm]:after:-inset-y-2 data-[size=sm]:after:content-[""]',
        className,
      )}
      {...props}
    >
      {thumb ? (
        <SwitchPrimitive.Thumb
          render={React.cloneElement(thumb, {
            className: cn('transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0', thumb.props.className),
          })}
        />
      ) : (
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'pointer-events-none block rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3.5 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground',
          )}
        />
      )}
    </SwitchPrimitive.Root>
  );
}
