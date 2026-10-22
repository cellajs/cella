'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { toggleVariants } from '~/modules/ui/toggle';
import { cn } from '~/utils/cn';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({ size: 'default', variant: 'default' });

interface ToggleGroupProps extends Omit<ToggleGroupPrimitive.Props, 'value' | 'defaultValue' | 'onValueChange'>, VariantProps<typeof toggleVariants> {
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
}

/** Base UI's group value is always an array; a single value of `''` means none. */
function toGroupValue(value: string | string[] | undefined) {
  if (value === undefined || Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function ToggleGroup({ className, variant, size, children, type = 'single', value, defaultValue, onValueChange, ...props }: ToggleGroupProps) {
  const multiple = type === 'multiple';

  const handleValueChange = onValueChange
    ? (groupValue: string[]) => {
        onValueChange(multiple ? groupValue : (groupValue[0] ?? ''));
      }
    : undefined;

  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      multiple={multiple}
      value={toGroupValue(value)}
      defaultValue={toGroupValue(defaultValue)}
      onValueChange={handleValueChange}
      className={cn('group/toggle-group flex w-fit items-center rounded-md', className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem({
  className,
  variant,
  size,
  render,
  nativeButton = !render,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({ variant: context.variant || variant, size: context.size || size }),
        'min-w-0 flex-none shrink-0 rounded-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l',
        className,
      )}
      nativeButton={nativeButton}
      render={render}
      {...props}
    />
  );
}
