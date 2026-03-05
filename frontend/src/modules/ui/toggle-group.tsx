'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { toggleVariants } from '~/modules/ui/toggle';
import { cn } from '~/utils/cn';

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: 'default',
  variant: 'default',
});

interface ToggleGroupProps
  extends Omit<React.ComponentProps<typeof ToggleGroupPrimitive>, 'value' | 'defaultValue' | 'onValueChange'>,
    VariantProps<typeof toggleVariants> {
  type?: 'single' | 'multiple';
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
}

export function ToggleGroup({
  className,
  variant,
  size,
  children,
  type = 'single',
  value,
  defaultValue,
  onValueChange,
  ...props
}: ToggleGroupProps) {
  const multiple = type === 'multiple';

  // Normalize value to array for Base UI
  const normalizedValue = value === undefined ? undefined : Array.isArray(value) ? value : value ? [value] : [];
  const normalizedDefault =
    defaultValue === undefined
      ? undefined
      : Array.isArray(defaultValue)
        ? defaultValue
        : defaultValue
          ? [defaultValue]
          : [];

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
      value={normalizedValue}
      defaultValue={normalizedDefault}
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
  children,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<typeof TogglePrimitive> & VariantProps<typeof toggleVariants> & { asChild?: boolean }) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        'min-w-0 shrink-0 rounded-none flex-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l',
        className,
      )}
      nativeButton={!asChild}
      render={
        asChild && React.isValidElement(children)
          ? (children as React.ReactElement<Record<string, unknown>>)
          : undefined
      }
      {...props}
    >
      {asChild ? undefined : children}
    </TogglePrimitive>
  );
}
