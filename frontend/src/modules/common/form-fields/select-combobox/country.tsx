import type { FieldValues } from 'react-hook-form';
import countries from '#json/countries.json';
import { CountryFlag } from '~/modules/common/country-flag';
import { ComboboxFormField, type ComboboxSelectProps } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';

const options = countries.map(({ code, name }) => ({ value: code, label: name }));

const renderCountryOption: ComboboxSelectProps['renderOption'] = ({ value, label }) => (
  <div className="flex flex-nowrap items-center truncate">
    <CountryFlag countryCode={value} imgType="png" className="mr-2 shrink-0" />
    <span className="truncate">{label}</span>
  </div>
);

export function SelectCountry<TFieldValues extends FieldValues>(props: BaseFormFieldProps<TFieldValues>) {
  return (
    <ComboboxFormField
      {...props}
      options={options}
      renderOption={renderCountryOption}
      clearable
      placeholders={{ trigger: 'c:placeholder.select_country', resource: 'c:country' }}
    />
  );
}
