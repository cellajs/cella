import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import countries from '#json/countries.json';
import CountryFlag from '~/modules/common/country-flag';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import Combobox, { type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

const SelectCountry = <TFieldValues extends FieldValues>({ control, name, disabled, label, required }: BaseFormFieldProps<TFieldValues>) => {
  const { t } = useTranslation();
  const options = countries.map(({ code, name }) => ({ value: code, label: name }));

  const renderCountryOption: ComboboxProps['renderOption'] = ({ value, label }) => (
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

          <FormControl>
            <Combobox
              options={options}
              value={value}
              onChange={onChange}
              renderOption={renderCountryOption}
              placeholders={{
                trigger: t('common:placeholder.select_country'),
                search: t('common:placeholder.search_country'),
                notFound: t('common:no_resource_found', { resource: t('common:country').toLowerCase() }),
              }}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectCountry;
