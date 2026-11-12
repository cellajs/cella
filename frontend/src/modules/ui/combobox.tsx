import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';
import { popupSideOffset } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

/** The first match is highlighted while typing, so type-then-Enter picks without arrow keys. */
export function Combobox<Value, Multiple extends boolean | undefined = false>(props: ComboboxPrimitive.Root.Props<Value, Multiple>) {
  return <ComboboxPrimitive.Root autoHighlight {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger data-slot="combobox-trigger" className={cn("[&_svg:not([class*='size-'])]:size-4", className)} {...props}>
      {children}
      <ChevronDownIcon data-slot="combobox-trigger-icon" className="text-faint-foreground pointer-events-none size-4" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear data-slot="combobox-clear" render={<InputGroupButton size="icon-xs" />} className={className} {...props}>
      <XIcon className="pointer-events-none size-3.5" />
    </ComboboxPrimitive.Clear>
  );
}

export function ComboboxInput({
  className,
  children,
  detail,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
  /** Muted text ahead of the trigger and clear buttons. */
  detail?: ReactNode;
}) {
  // Base UI's group part is the popup's anchor, so the popup takes the field's full width
  return (
    <ComboboxPrimitive.InputGroup render={<InputGroup className={cn('w-auto', className)} />}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {detail && <span className="text-faint-foreground font-normal tabular-nums">{detail}</span>}
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </ComboboxPrimitive.InputGroup>
  );
}

export function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = popupSideOffset,
  align = 'start',
  alignOffset = 0,
  collisionPadding = 5,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor' | 'collisionPadding'>) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner {...{ side, sideOffset, align, alignOffset, anchor, collisionPadding }} positionMethod="fixed" className="z-200">
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'popup-motion',
            'group/combobox-content bg-popover text-popover-foreground ring-foreground/10 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 relative max-h-(--available-height) w-(--anchor-width) overflow-hidden rounded-md shadow-md ring-1 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

export function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'max-h-[min(calc(--spacing(96)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto p-1 data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "active:bg-accent data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-3 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Item>
  );
}

interface ComboboxItemIndicatorProps extends ComboboxPrimitive.ItemIndicator.Props {
  /** An X in place of the check, on a selected row whose press would deselect it. */
  asRemove?: boolean;
}

/** Selected-check for combobox rows: kept mounted so unselected rows reserve the space and trailing content stays column-aligned. */
export function ComboboxItemIndicator({ className, asRemove, ...props }: ComboboxItemIndicatorProps) {
  const Icon = asRemove ? XIcon : CheckIcon;
  return (
    <ComboboxPrimitive.ItemIndicator
      keepMounted
      data-slot="combobox-item-indicator"
      className={cn(
        'text-success pointer-events-none flex size-4 items-center justify-center not-data-selected:invisible',
        asRemove && 'text-foreground',
        className,
      )}
      {...props}
    >
      <Icon className="pointer-events-none size-4 pointer-coarse:size-5" />
    </ComboboxPrimitive.ItemIndicator>
  );
}

export function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn('text-faint-foreground flex w-full items-center justify-center py-2 text-center text-sm empty:hidden', className)}
      {...props}
    />
  );
}

export function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={className} {...props} />;
}

export function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn('group-label px-2 py-1.5 text-xs pointer-coarse:px-3 pointer-coarse:py-2', className)}
      {...props}
    />
  );
}

export function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return <ComboboxPrimitive.Separator data-slot="combobox-separator" className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />;
}

export { ComboboxPrimitive };
