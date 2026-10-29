import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import countries from '#json/countries.json';
import { CountryFlag } from '~/modules/common/country-flag';
import { ComboboxFormField } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { regionName } from '~/utils/region-name';
import { deviceCountry } from '~/utils/time-zones';

type CountryFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  /** Runs after the field takes a picked code, an empty string once cleared. */
  onSelect?: (code: string) => void;
};

/** Suggests the device's country first, then `appConfig.commonCountries`. */
export function CountryFormField<TFieldValues extends FieldValues>(props: CountryFormFieldProps<TFieldValues>) {
  const { t, i18n } = useTranslation();

  const options = countries
    .map(({ code }) => ({
      value: code,
      label: regionName(code, i18n.language),
      icon: <CountryFlag countryCode={code} imgType="png" alt="" className="shrink-0" />,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));
  const detected = deviceCountry();

  return (
    <ComboboxFormField
      {...props}
      options={options}
      suggested={{ label: t('c:suggested'), values: detected ? [detected, ...appConfig.commonCountries] : appConfig.commonCountries }}
      clearable
      placeholders={{ trigger: 'c:placeholder.select_country', resource: 'c:country' }}
    />
  );
}
