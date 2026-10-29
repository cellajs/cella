import { SearchIcon } from 'lucide-react';
import { Fragment, type ReactNode, useRef, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { InputTriggerButton } from '~/modules/common/form-fields/input-trigger-button';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxPrimitive,
  ComboboxSeparator,
} from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { InputGroupAddon } from '~/modules/ui/input-group';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Leads the option's row, and the picked value in a closed field. */
  icon?: ReactNode;
  /** Muted text closing the row, and the picked value in a closed searchable field, such as an offset. */
  detail?: string;
  /** Text the search matches besides the label, such as a timezone's id and name. */
  keywords?: string;
}

type OptionGroup<TOption> = { label: string; items: TOption[] };

export interface ComboboxSelectProps<TOption extends ComboboxOption = ComboboxOption> {
  options: readonly TOption[];
  value: string;
  onChange: (value: string) => void;
  /** Listed first under its label, in the order given; these options leave the rest of the list. */
  suggested?: { label: string; values: readonly string[] };
  /** Row content between icon and detail; the label by default. */
  renderOption?: (option: TOption) => ReactNode;
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

const searchText = (option: ComboboxOption) => (option.keywords ? `${option.label} ${option.keywords}` : option.label);

/** Single-value combobox form control: a button (or searchable input) trigger over a filterable option list. */
export function ComboboxSelect<TOption extends ComboboxOption>({
  options,
  value,
  onChange,
  suggested,
  renderOption,
  clearable = false,
  disabled = false,
  searchableTrigger = false,
  placeholders: passedPlaceholders,
}: ComboboxSelectProps<TOption>) {
  const { t } = useTranslation();
  const { contains } = ComboboxPrimitive.useFilter();
  const [open, setOpen] = useState(false);

  const placeholders = { ...defaultPlaceholders, ...passedPlaceholders };
  const resource = t(placeholders.resource);
  const triggerText = t(placeholders.trigger, { resource });

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const anchorRef = useRef<HTMLDivElement>(null);

  const suggestedOptions = [...new Set(suggested?.values)].flatMap(
    (suggestedValue) => options.find((option) => option.value === suggestedValue) ?? [],
  );
  const groups: OptionGroup<TOption>[] | null =
    suggested && suggestedOptions.length
      ? [
          { label: suggested.label, items: suggestedOptions },
          { label: '', items: options.filter((option) => !suggestedOptions.includes(option)) },
        ]
      : null;
  // While typing, the picked value's icon and detail would describe an option the query may no longer match
  const showPicked = !!selectedOption && !open;

  const renderItem = (option: TOption) => (
    <ComboboxItem key={option.value} value={option} className="justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {option.icon}
        {renderOption ? renderOption(option) : <span className="truncate">{option.label}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {option.detail && <span className="text-faint-foreground text-xs tabular-nums">{option.detail}</span>}
        <ComboboxItemIndicator />
      </div>
    </ComboboxItem>
  );

  return (
    <Combobox<TOption>
      items={groups ?? options}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      filter={(item, query) => contains(item, query, searchText)}
      value={selectedOption}
      onValueChange={(item) => {
        if (item) onChange(item.value);
        else if (clearable) onChange('');
      }}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      {searchableTrigger ? (
        <div ref={anchorRef}>
          <ComboboxInput
            placeholder={triggerText}
            showTrigger
            showClear={clearable && !!selectedOption}
            detail={showPicked && selectedOption.detail}
            disabled={disabled}
            className="w-full"
          >
            {showPicked && selectedOption.icon && <InputGroupAddon align="inline-start">{selectedOption.icon}</InputGroupAddon>}
          </ComboboxInput>
        </div>
      ) : (
        <ComboboxPrimitive.Trigger
          data-slot="combobox-trigger"
          render={<InputTriggerButton aria-haspopup="listbox" className="w-full truncate" disabled={disabled} />}
        >
          {selectedOption ? (
            <div className="flex items-center gap-2 truncate">
              {selectedOption.icon}
              <span className="truncate">{selectedOption.label}</span>
            </div>
          ) : (
            <span className="truncate text-muted-foreground">{triggerText}</span>
          )}
        </ComboboxPrimitive.Trigger>
      )}
      <ComboboxContent anchor={searchableTrigger ? anchorRef : undefined}>
        {!searchableTrigger && <ComboboxInput placeholder={t(placeholders.search)} showTrigger={false} />}
        <ComboboxList>
          {groups
            ? (group: OptionGroup<TOption>, index: number) => (
                <Fragment key={group.label}>
                  {index > 0 && <ComboboxSeparator />}
                  <ComboboxGroup items={group.items}>
                    {group.label && <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>}
                    <ComboboxPrimitive.Collection>{renderItem}</ComboboxPrimitive.Collection>
                  </ComboboxGroup>
                </Fragment>
              )
            : renderItem}
        </ComboboxList>
        <ComboboxEmpty>
          <ContentPlaceholder icon={SearchIcon} title={placeholders.notFound} titleOptions={{ resource }} />
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

interface ComboboxFormFieldProps<TFieldValues extends FieldValues, TOption extends ComboboxOption>
  extends Pick<BaseFormFieldProps<TFieldValues>, 'control' | 'name' | 'disabled'>,
    Omit<ComboboxSelectProps<TOption>, 'value' | 'onChange' | 'disabled' | 'searchableTrigger'> {
  /** Without one the field renders an empty label. */
  label?: string;
  /** Shows the required star on the label. */
  required?: boolean;
  /** Runs after the field takes the picked value, an empty string once cleared. */
  onSelect?: (value: string) => void;
}

/** `ComboboxSelect` with a searchable trigger, as a labelled form field. */
export function ComboboxFormField<TFieldValues extends FieldValues, TOption extends ComboboxOption = ComboboxOption>({
  control,
  name,
  label,
  required,
  disabled,
  onSelect,
  ...comboboxProps
}: ComboboxFormFieldProps<TFieldValues, TOption>) {
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
