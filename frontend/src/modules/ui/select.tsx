import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import type * as React from 'react';
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import { cn } from '~/utils/cn';

// Context to pass the current value from Select to SelectItem for reliable checkmarks.
// Works around a Base UI timing issue where ItemIndicator can show stale selection state.
const SelectValueContext = createContext<string | null | undefined>(undefined);

// Registry that lets SelectItem children register their displayed label so SelectValue
// can render the label (e.g. "Banana") instead of the raw value ("banana").
type LabelRegistry = {
  register: (value: string, label: React.ReactNode) => () => void;
  getLabel: (value: string | null) => React.ReactNode;
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
};
const SelectLabelRegistryContext = createContext<LabelRegistry | null>(null);

function useLabelRegistry(): LabelRegistry {
  // Stable registry object so context value identity never changes (avoids infinite re-renders).
  const ref = useRef<LabelRegistry | null>(null);
  if (ref.current === null) {
    const labels = new Map<string, React.ReactNode>();
    const listeners = new Set<() => void>();
    let version = 0;
    const notify = () => {
      version += 1;
      listeners.forEach((l) => {
        l();
      });
    };
    ref.current = {
      register(value, label) {
        labels.set(value, label);
        notify();
        return () => {
          labels.delete(value);
          notify();
        };
      },
      getLabel(value) {
        if (value == null) return null;
        return labels.has(value) ? labels.get(value) : value;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getVersion: () => version,
    };
  }
  return ref.current;
}

// Override onValueChange to narrow Base UI's (string | null) to string for all consumers
type SelectProps = Omit<SelectPrimitive.Root.Props<string>, 'onValueChange'> & {
  onValueChange?: (value: string) => void;
};

function Select({ onValueChange, value, ...props }: SelectProps) {
  const registry = useLabelRegistry();
  return (
    <SelectValueContext.Provider value={value}>
      <SelectLabelRegistryContext.Provider value={registry}>
        <SelectPrimitive.Root
          data-slot="select"
          value={value}
          onValueChange={onValueChange as SelectPrimitive.Root.Props<string>['onValueChange']}
          {...props}
        />
      </SelectLabelRegistryContext.Provider>
    </SelectValueContext.Provider>
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
  const registry = useContext(SelectLabelRegistryContext);
  // Subscribe so SelectValue re-renders when items register/unregister labels.
  useSyncExternalStore(
    registry?.subscribe ?? (() => () => {}),
    registry?.getVersion ?? (() => 0),
    registry?.getVersion ?? (() => 0),
  );
  return (
    <>
      <SelectPrimitive.Value data-slot="select-value" {...props}>
        {registry ? (value: string | null) => registry.getLabel(value) : undefined}
      </SelectPrimitive.Value>
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
        "focus-effect flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[size=default]:h-10 data-[size=sm]:h-8 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
          'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-closed:animate-out data-open:animate-in',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List
          className={cn('p-1', position === 'popper' && 'w-full min-w-(--anchor-width) scroll-my-1')}
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
      className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props & React.RefAttributes<HTMLDivElement>) {
  const selectValue = useContext(SelectValueContext);
  const registry = useContext(SelectLabelRegistryContext);
  const isSelected = selectValue !== undefined && props.value !== undefined && selectValue === props.value;

  // Register this item's label so SelectValue can display it for the selected value.
  useEffect(() => {
    if (!registry || typeof props.value !== 'string') return;
    return registry.register(props.value, children);
  }, [registry, props.value, children]);

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
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

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props & React.RefAttributes<HTMLHRElement>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
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
