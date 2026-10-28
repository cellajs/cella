import { SearchIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { InputTriggerButton } from '~/modules/common/form-fields/input-trigger-button';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxPrimitive } from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

export interface ComboboxOption {
  value: string;
  label: string;
  url?: string | null;
}

export interface ComboboxSelectProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  renderOption?: (option: ComboboxOption) => ReactNode;
  showAvatar?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  searchableTrigger?: boolean;
  placeholders?: { trigger?: TKey; search?: TKey; notFound?: TKey; resource?: TKey };
}

const defaultPlaceholders = {
  trigger: 'c:select',
  search: 'c:placeholder.search',
  notFound: 'c:no_resource_found',
  resource: 'c:item',
} satisfies ComboboxSelectProps['placeholders'];

/** Single-value combobox form control: a button (or searchable input) trigger over a filterable option list. */
export function ComboboxSelect({
  options,
  value,
  onChange,
  renderOption,
  showAvatar = false,
  clearable = false,
  disabled = false,
  searchableTrigger = false,
  placeholders: passedPlaceholders,
}: ComboboxSelectProps) {
  const { t } = useTranslation();

  const placeholders = { ...defaultPlaceholders, ...passedPlaceholders };
  const resource = t(placeholders.resource);
  const triggerText = t(placeholders.trigger, { resource });

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const anchorRef = useRef<HTMLDivElement>(null);

  const optionLabel = (option: ComboboxOption, avatarClassName?: string) => (
    <>
      {showAvatar && <EntityAvatar className={avatarClassName} id={option.value} name={option.label} url={option.url} />}
      {renderOption ? renderOption(option) : <span className="truncate">{option.label}</span>}
    </>
  );

  return (
    <Combobox<ComboboxOption>
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
          <ComboboxInput placeholder={triggerText} showTrigger showClear={clearable && !!selectedOption} disabled={disabled} className="w-full" />
        </div>
      ) : (
        <ComboboxPrimitive.Trigger
          data-slot="combobox-trigger"
          render={<InputTriggerButton aria-haspopup="listbox" className="w-full truncate" disabled={disabled} />}
        >
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">{optionLabel(selectedOption, 'size-6')}</div>
          ) : (
            <span className="truncate text-muted-foreground">{triggerText}</span>
          )}
        </ComboboxPrimitive.Trigger>
      )}
      <ComboboxContent anchor={searchableTrigger ? anchorRef : undefined}>
        {!searchableTrigger && <ComboboxInput placeholder={t(placeholders.search)} showTrigger={false} />}
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              <div className="flex min-w-0 items-center gap-2">{optionLabel(item)}</div>
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>
          <ContentPlaceholder icon={SearchIcon} title={placeholders.notFound} titleOptions={{ resource }} />
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

interface ComboboxFormFieldProps<TFieldValues extends FieldValues>
  extends Pick<BaseFormFieldProps<TFieldValues>, 'control' | 'name' | 'disabled'>,
    Omit<ComboboxSelectProps, 'value' | 'onChange' | 'disabled' | 'searchableTrigger'> {
  /** Without one the field renders an empty label. */
  label?: string;
  /** Shows the required star on the label. */
  required?: boolean;
  /** Runs after the field takes the picked value, an empty string once cleared. */
  onSelect?: (value: string) => void;
}

/** `ComboboxSelect` with a searchable trigger, as a labelled form field. */
export function ComboboxFormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  required,
  disabled,
  onSelect,
  ...comboboxProps
}: ComboboxFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem name={name} disabled={disabled}>
          <FormLabel required={required}>{label}</FormLabel>
          <ComboboxSelect
            {...comboboxProps}
            value={value}
            onChange={(nextValue) => {
              onChange(nextValue);
              onSelect?.(nextValue);
            }}
            disabled={disabled}
            searchableTrigger
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
