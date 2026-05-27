import type * as React from 'react';
import { cn } from '~/utils/cn';

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: generic Label primitive; consumers supply htmlFor/control via {...props}.
    <label
      data-slot="label"
      className={cn(
        'flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
