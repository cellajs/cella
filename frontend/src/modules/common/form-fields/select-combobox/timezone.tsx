import type { FieldValues } from 'react-hook-form';
import timezones from '#json/timezones.json';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { ComboboxSelect } from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

/**
 * Combobox form field for selecting a timezone.
 */
export const SelectTimezone = <TFieldValues extends FieldValues>({
  control,
  name,
  disabled,
  label,
  required,
}: BaseFormFieldProps<TFieldValues>) => {
  const seen = new Set<string>();
  const options = timezones.reduce<{ value: string; label: string }[]>((acc, { utc, text }) => {
    const value = utc[0];
    if (value && !seen.has(value)) {
      seen.add(value);
      acc.push({ value, label: text });
    }
    return acc;
  }, []);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem name={name} aria-disabled={disabled}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>

          <ComboboxSelect
            options={options}
            value={value}
            onChange={onChange}
            disabled={disabled}
            clearable
            searchableTrigger
            placeholders={{
              trigger: 'c:placeholder.select_timezone',
              search: 'c:placeholder.search_timezone',
              notFound: 'c:no_resource_found',
              resource: 'c:timezone',
            }}
          />

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
