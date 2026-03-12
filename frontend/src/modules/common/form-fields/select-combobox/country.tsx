import type { FieldValues } from 'react-hook-form';
import countries from '#json/countries.json';
import { CountryFlag } from '~/modules/common/country-flag';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { ComboboxSelect, type ComboboxSelectProps } from '~/modules/ui/combobox';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';

/**
 * Combobox form field for selecting a country, with flag icons.
 */
export const SelectCountry = <TFieldValues extends FieldValues>({
  control,
  name,
  disabled,
  label,
  required,
}: BaseFormFieldProps<TFieldValues>) => {
  const options = countries.map(({ code, name }) => ({ value: code, label: name }));

  const renderCountryOption: ComboboxSelectProps['renderOption'] = ({ value, label }) => (
    <div className="flex items-center flex-nowrap truncate">
      <CountryFlag countryCode={value} imgType="png" className="mr-2 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );

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
            renderOption={renderCountryOption}
            placeholders={{
              trigger: 'common:placeholder.select_country',
              search: 'common:placeholder.search_country',
              notFound: 'common:no_resource_found',
              resource: 'common:country',
            }}
          />

          <FormMessage />
        </FormItem>
      )}
    />
  );
};
