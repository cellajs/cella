import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { type PositionedContentProps, popupSideOffset } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

// Hands the value to SelectItem for its check: Base UI's ItemIndicator can show a stale selection.
const SelectValueContext = createContext<string | null | undefined>(undefined);

interface SelectProps extends Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> {
  /** Skips Base UI's `null` value, so a consumer always gets a string. */
  onValueChange?: (value: string) => void;
}

/** Pass `items` when labels differ from values: SelectValue reads them before the popup has ever mounted. */
export function Select({ onValueChange, value, defaultValue, ...props }: SelectProps) {
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

export function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

export function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

export function SelectTrigger({ className, size = 'default', children, ...props }: SelectPrimitive.Trigger.Props & { size?: 'sm' | 'default' }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "focus-effect border-input bg-background aria-invalid:border-destructive data-placeholder:text-faint-foreground [&_svg:not([class*='text-'])]:text-muted-foreground flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-10 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDownIcon className="text-faint-foreground size-4" />} />
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  align = 'center',
  side = 'bottom',
  sideOffset = popupSideOffset,
  alignOffset,
  alignItemWithTrigger = false,
  container,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'alignItemWithTrigger'> &
  Pick<PositionedContentProps, 'container'>) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner {...{ side, sideOffset, align, alignOffset, alignItemWithTrigger }} className="z-270">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 bg-popover text-popover-foreground data-closed:animate-out data-open:animate-in relative max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md',
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

export function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel data-slot="select-label" className={cn('group-label px-2 py-1.5 text-xs', className)} {...props} />;
}

export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  const selectValue = useContext(SelectValueContext);
  const isSelected = selectValue !== undefined && props.value !== undefined && selectValue === props.value;

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "active:bg-accent active:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        {isSelected && <CheckIcon className="text-success size-4" />}
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator data-slot="select-separator" className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)} {...props} />
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
