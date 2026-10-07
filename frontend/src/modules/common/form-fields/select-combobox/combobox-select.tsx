import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { Button } from '~/modules/ui/button';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPrimitive } from '~/modules/ui/combobox';

export interface ComboBoxOption {
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
  placeholders?: { trigger?: TKey; search?: TKey; notFound?: TKey; resource?: TKey };
}

/** Single-value combobox form control: a button (or searchable input) trigger over a filterable option list. */
export function ComboboxSelect({
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
          render={<Button variant="input" aria-haspopup="listbox" className="w-full justify-between truncate font-normal" disabled={disabled} />}
        >
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">
              {renderAvatar && (
                <EntityAvatar className="size-6 shrink-0" id={selectedOption.value} name={selectedOption.label} url={selectedOption.url} />
              )}
              {renderOption ? renderOption(selectedOption) : <span className="truncate">{selectedOption.label}</span>}
            </div>
          ) : (
            <span className="truncate text-muted-foreground">{t(placeholders.trigger, { resource: t(placeholders.resource).toLowerCase() })}</span>
          )}
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
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
          <ContentPlaceholder icon={SearchIcon} title={placeholders.notFound} titleProps={{ resource: t(placeholders.resource).toLowerCase() }} />
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
