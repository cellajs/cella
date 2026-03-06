import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import * as React from 'react';
import { cn } from '~/utils/cn';

interface SwitchProps extends React.ComponentProps<typeof SwitchPrimitive.Root> {
  thumb?: React.ReactElement<{ className?: string }>;
}

export function Switch({ className, thumb, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[checked]:bg-primary data-[unchecked]:bg-muted-foreground/25 dark:data-[unchecked]:bg-muted-foreground/30 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 focus-effect',
        className,
      )}
      {...props}
    >
      {thumb ? (
        <SwitchPrimitive.Thumb
          render={React.cloneElement(thumb, {
            className: cn(
              'transition-transform data-[checked]:translate-x-[calc(100%-2px)] data-[unchecked]:translate-x-0',
              thumb.props.className,
            ),
          })}
        />
      ) : (
        // fallback default thumb
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            'bg-background dark:data-[unchecked]:bg-foreground dark:data-[checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[checked]:translate-x-[calc(100%-2px)] data-[unchecked]:translate-x-0',
          )}
        />
      )}
    </SwitchPrimitive.Root>
  );
}
