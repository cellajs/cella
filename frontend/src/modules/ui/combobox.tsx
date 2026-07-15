import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, CircleXIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

// Styled base-ui Combobox primitives

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
      <XIcon className="icon-sm pointer-events-none" />
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
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          />
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
            'data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:animate-out data-open:animate-in',
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
        'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm outline-hidden',
        'data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
      >
        <CheckIcon className="pointer-events-none pointer-coarse:size-5 size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

/**
 * Item indicator kept mounted to reserve space (only shows the check when selected), so trailing
 * content (e.g. hotkey numbers) stays aligned.
 */
function ComboboxItemIndicator({ className, ...props }: ComboboxPrimitive.ItemIndicator.Props) {
  return (
    <ComboboxPrimitive.ItemIndicator
      keepMounted
      data-slot="combobox-item-indicator"
      className={cn(
        'pointer-events-none flex size-4 items-center justify-center [&:not([data-selected])]:invisible',
        className,
      )}
      {...props}
    >
      <CheckIcon className="pointer-events-none pointer-coarse:size-5 size-4" />
    </ComboboxPrimitive.ItemIndicator>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'flex w-full items-center justify-center py-2 text-center text-muted-foreground text-sm empty:hidden',
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
        'pointer-coarse:px-3 px-2 pointer-coarse:py-2 py-1.5 pointer-coarse:text-sm text-muted-foreground text-xs',
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function ComboboxStatus({ className, ...props }: ComboboxPrimitive.Status.Props) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn('px-3 py-2 text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function ComboboxValue(props: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.Label.Props) {
  return <ComboboxPrimitive.Label data-slot="combobox-label" className={cn(className)} {...props} />;
}

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn('flex flex-wrap items-center gap-1', className)}
      {...props}
    />
  );
}

function ComboboxChip({ className, children, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'inline-flex max-w-60 items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-secondary-foreground text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipRemove({ className, ...props }: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      className={cn(
        '-mr-1 inline-flex size-4 items-center justify-center rounded-full opacity-60 hover:opacity-100',
        className,
      )}
      {...props}
    >
      <XIcon className="icon-xs" />
    </ComboboxPrimitive.ChipRemove>
  );
}

/**
 * Search-styled combobox input (command palette / dropdowner). Uses `type="search"` so password
 * managers (NordPass, etc.) skip it.
 */
function ComboboxSearchInput({
  className,
  wrapClassName,
  isSearching = false,
  spinnerDelay,
  showClear = true,
  value,
  ref,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'value'> & {
  value: string;
  wrapClassName?: string;
  isSearching?: boolean;
  spinnerDelay?: number;
  showClear?: boolean;
}) {
  return (
    <div
      data-slot="combobox-search-input-wrapper"
      className={cn('group relative flex h-10 items-center border-b px-3', wrapClassName, value.length > 0 && 'pr-10')}
    >
      <SearchSpinner isSearching={isSearching} value={value} appearDelay={spinnerDelay} />
      <ComboboxPrimitive.Input
        data-slot="combobox-search-input"
        className={cn(
          'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden',
          className,
        )}
        value={value}
        data-1p-ignore
        data-lpignore="true"
        {...props}
        ref={(el) => {
          // Set type="search" imperatively because base-ui omits it from its types.
          // Password managers skip search inputs.
          if (el) el.type = 'search';
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
      />
      {showClear && value.length > 0 && (
        <ComboboxPrimitive.Clear
          render={
            <button
              type="button"
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer opacity-70 hover:opacity-100"
            />
          }
        >
          <CircleXIcon />
        </ComboboxPrimitive.Clear>
      )}
    </div>
  );
}

// High-level ComboboxSelect: drop-in for form fields

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
  clearable?: boolean;
  disabled?: boolean;
  searchableTrigger?: boolean;
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
  clearable = false,
  disabled = false,
  searchableTrigger = false,
  placeholders: passedPlaceholders,
}: ComboboxSelectProps) {
  const { t } = useTranslation();

  const placeholders = {
    trigger: 'c:select' as TKey,
    search: 'c:placeholder.search' as TKey,
    notFound: 'c:no_resource_found' as TKey,
    resource: 'c:item' as TKey,
    ...passedPlaceholders,
  };

  const selectedOption = options.find((o) => o.value === value) ?? null;
  const anchorRef = React.useRef<HTMLDivElement>(null);

  return (
    <Combobox<ComboBoxOption>
      items={options}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      value={selectedOption}
      onValueChange={(item) => {
        if (item) onChange(item.value);
        else if (clearable) onChange('');
      }}
      disabled={disabled}
    >
      {searchableTrigger ? (
        <div ref={anchorRef}>
          <ComboboxInput
            placeholder={t(placeholders.trigger, { resource: t(placeholders.resource).toLowerCase() })}
            showTrigger
            showClear={clearable && !!selectedOption}
            disabled={disabled}
            className="w-full"
          />
        </div>
      ) : (
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
            <div className="flex items-center gap-2 truncate">
              {renderAvatar && (
                <EntityAvatar
                  className="h-6 w-6 shrink-0 text-xs"
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
      )}
      <ComboboxContent anchor={searchableTrigger ? anchorRef : undefined}>
        {!searchableTrigger && <ComboboxInput placeholder={t(placeholders.search)} showTrigger={false} />}
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
  type ComboBoxOption,
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxPrimitive,
  ComboboxSearchInput,
  ComboboxSelect,
  ComboboxSeparator,
  ComboboxStatus,
  ComboboxTrigger,
  ComboboxValue,
};
