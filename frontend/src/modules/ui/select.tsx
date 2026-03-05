import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

// Override onValueChange to maintain Radix-compatible signature (value is always string, not null)
type SelectProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> & {
  onValueChange?: (value: string) => void;
};

function Select({ onValueChange, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      data-slot="select"
      onValueChange={onValueChange as SelectPrimitive.Root.Props<string>['onValueChange']}
      {...props}
    />
  );
}

function SelectGroup({ ...props }: SelectPrimitive.Group.Props & React.RefAttributes<HTMLDivElement>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  placeholder,
  ...props
}: SelectPrimitive.Value.Props &
  React.RefAttributes<HTMLSpanElement> & {
    placeholder?: string;
  }) {
  return (
    <>
      <SelectPrimitive.Value data-slot="select-value" {...props} />
      {placeholder && <span className="hidden [[data-placeholder]_&]:inline">{placeholder}</span>}
    </>
  );
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props &
  React.RefAttributes<HTMLButtonElement> & {
    size?: 'sm' | 'default';
  }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-effect aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-fit items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-regular opacity-50" />} />
    </SelectPrimitive.Trigger>
  );
}

/**
 * Renders select content without a portal for custom layering.
 */
export function SelectContentNoPortal({
  className,
  children,
  position = 'popper',
  align = 'center',
  side = 'bottom',
  sideOffset,
  alignOffset,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  className?: string;
  children?: React.ReactNode;
  position?: 'popper' | 'item-aligned';
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  alignOffset?: number;
}) {
  return (
    <SelectPrimitive.Positioner
      align={align}
      side={side}
      sideOffset={position === 'popper' ? (sideOffset ?? 1) : sideOffset}
      alignOffset={alignOffset}
      alignItemWithTrigger={position !== 'popper'}
      className="z-270"
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        className={cn(
          'bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List
          className={cn(
            'p-1',
            position === 'popper' && 'h-(--anchor-height) w-full min-w-(--anchor-width) scroll-my-1',
          )}
        >
          {children}
        </SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  );
}

function SelectContent(props: React.ComponentProps<typeof SelectContentNoPortal>) {
  return (
    <SelectPrimitive.Portal>
      <SelectContentNoPortal {...props} />
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4 text-success" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props & React.RefAttributes<HTMLHRElement>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: Partial<SelectPrimitive.ScrollUpArrow.Props> & React.RefAttributes<HTMLDivElement>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: Partial<SelectPrimitive.ScrollDownArrow.Props> & React.RefAttributes<HTMLDivElement>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
