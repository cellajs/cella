import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import type { PositionedContentProps } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

// Hands the value to SelectItem for its check: Base UI's ItemIndicator can show a stale selection.
const SelectValueContext = createContext<string | null | undefined>(undefined);

interface SelectProps extends Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> {
  /** Skips Base UI's `null` value, so a consumer always gets a string. */
  onValueChange?: (value: string) => void;
}

/** Pass `items` when labels differ from values: SelectValue reads them before the popup has ever mounted. */
function Select({ onValueChange, value, defaultValue, ...props }: SelectProps) {
  // Mirrors an uncontrolled value, so its item shows the check too
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);

  return (
    <SelectValueContext.Provider value={value === undefined ? uncontrolledValue : value}>
      <SelectPrimitive.Root
        data-slot="select"
        value={value}
        defaultValue={defaultValue}
        onValueChange={(nextValue) => {
          setUncontrolledValue(nextValue);
          if (nextValue !== null) onValueChange?.(nextValue);
        }}
        {...props}
      />
    </SelectValueContext.Provider>
  );
}

function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ className, size = 'default', children, ...props }: SelectPrimitive.Trigger.Props & { size?: 'sm' | 'default' }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "focus-effect flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input field-hover:border-input-hover bg-background px-3 py-2 text-sm transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[size=default]:h-10 data-[size=sm]:h-8 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-muted-foreground/70" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  align = 'center',
  side = 'bottom',
  sideOffset = 1,
  alignOffset,
  alignItemWithTrigger = false,
  container,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'alignItemWithTrigger'> &
  Pick<PositionedContentProps, 'container'>) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-270"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-closed:animate-out data-open:animate-in',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="w-full min-w-(--anchor-width) scroll-my-1 p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)} {...props} />;
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  const selectValue = useContext(SelectValueContext);
  const isSelected = selectValue !== undefined && props.value !== undefined && selectValue === props.value;

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden active:bg-accent active:text-accent-foreground data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        isSelected && 'font-medium',
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        {isSelected && <CheckIcon className="size-4 text-success" />}
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator data-slot="select-separator" className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)} {...props} />
  );
}

function SelectScrollUpButton({ className, ...props }: Partial<SelectPrimitive.ScrollUpArrow.Props>) {
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

function SelectScrollDownButton({ className, ...props }: Partial<SelectPrimitive.ScrollDownArrow.Props>) {
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

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue };
