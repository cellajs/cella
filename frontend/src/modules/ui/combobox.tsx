import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

// ============================================================================
// Styled base-ui Combobox primitives
// ============================================================================

const Combobox = ComboboxPrimitive.Root;

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon data-slot="combobox-trigger-icon" className="pointer-events-none size-4 text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={cn('w-auto', className)}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            asChild
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          >
            <ComboboxTrigger />
          </InputGroupButton>
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  collisionPadding = 5,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor' | 'collisionPadding'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        positionMethod="fixed"
        collisionPadding={collisionPadding}
        className="z-200"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'group/combobox-content relative max-h-(--available-height) w-(--anchor-width) overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100',
            'origin-(--transform-origin)',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            '*:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:border-input/30 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:shadow-none',
            'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
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

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none',
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
      >
        <CheckIcon className="pointer-events-none size-4 pointer-coarse:size-5" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'hidden w-full justify-center py-2 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />;
}

function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn(
        'px-2 py-1.5 text-xs text-muted-foreground pointer-coarse:px-3 pointer-coarse:py-2 pointer-coarse:text-sm',
        className,
      )}
      {...props}
    />
  );
}

// ============================================================================
// High-level ComboboxSelect — drop-in for form fields
// ============================================================================

interface ComboBoxOption {
  value: string;
  label: string;
  url?: string | null;
}

export interface ComboboxSelectProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (newValue: string) => void;
  renderOption?: (option: ComboBoxOption) => React.ReactNode;
  renderAvatar?: boolean;
  disabled?: boolean;
  placeholders?: {
    trigger?: TKey;
    search?: TKey;
    notFound?: TKey;
    resource?: TKey;
  };
}

/**
 * High-level combobox select for form fields.
 * Wraps base-ui Combobox with a trigger button, search input, and option list.
 */
function ComboboxSelect({
  options,
  value,
  onChange,
  renderOption,
  renderAvatar = false,
  disabled = false,
  placeholders: passedPlaceholders,
}: ComboboxSelectProps) {
  const { t } = useTranslation();

  const placeholders = {
    trigger: 'common:select' as TKey,
    search: 'common:placeholder.search' as TKey,
    notFound: 'common:no_resource_found' as TKey,
    resource: 'common:item' as TKey,
    ...passedPlaceholders,
  };

  const selectedOption = options.find((o) => o.value === value) ?? null;

  return (
    <Combobox<ComboBoxOption>
      items={options}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      value={selectedOption}
      onValueChange={(item) => {
        if (item) onChange(item.value);
      }}
      disabled={disabled}
    >
      <ComboboxPrimitive.Trigger
        data-slot="combobox-trigger"
        render={
          <Button
            variant="input"
            aria-haspopup="listbox"
            className="w-full justify-between truncate font-normal"
            disabled={disabled}
          />
        }
      >
        {selectedOption ? (
          <div className="flex items-center truncate gap-2">
            {renderAvatar && (
              <EntityAvatar
                className="h-6 w-6 text-xs shrink-0"
                id={selectedOption.value}
                name={selectedOption.label}
                url={selectedOption.url}
              />
            )}
            {renderOption ? renderOption(selectedOption) : <span className="truncate">{selectedOption.label}</span>}
          </div>
        ) : (
          <span className="truncate text-muted-foreground">
            {t(placeholders.trigger, { resource: t(placeholders.resource).toLowerCase() })}
          </span>
        )}
        <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </ComboboxPrimitive.Trigger>
      <ComboboxContent>
        <ComboboxInput placeholder={t(placeholders.search)} showTrigger={false} />
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              <div className="flex items-center gap-2">
                {renderAvatar && <EntityAvatar id={item.value} name={item.label} url={item.url} />}
                {renderOption ? renderOption(item) : <span className="truncate">{item.label}</span>}
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>
          <ContentPlaceholder
            icon={SearchIcon}
            title={placeholders.notFound}
            titleProps={{ resource: t(placeholders.resource).toLowerCase() }}
          />
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

export {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxSelect,
  ComboboxTrigger,
  type ComboBoxOption,
};
