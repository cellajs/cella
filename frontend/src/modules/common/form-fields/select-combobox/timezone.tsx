import { GlobeIcon } from 'lucide-react';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '~/modules/common/country-flag';
import { ComboboxFormField, type ComboboxOption } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { regionName } from '~/utils/region-name';
import { countryTimeZones, deviceTimeZone, timeZoneTable } from '~/utils/time-zones';

type TimezoneOption = ComboboxOption & { city: string; subtitle: string };

type TimezoneFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  /** The picked country code: its zones are suggested, else the device's zone is. */
  country?: string | null;
};

export function TimezoneFormField<TFieldValues extends FieldValues>({ country, ...props }: TimezoneFormFieldProps<TFieldValues>) {
  const { t, i18n } = useTranslation();

  const countryZones = country ? countryTimeZones(country, i18n.language) : [];
  const device = deviceTimeZone();
  const suggested =
    country && countryZones.length
      ? { label: regionName(country, i18n.language), values: countryZones.map(({ zone }) => zone) }
      : { label: t('c:suggested'), values: device ? [device] : [] };

  const options: TimezoneOption[] = timeZoneTable(i18n.language).map((entry) => ({
    value: entry.zone,
    label: entry.country ? `${entry.city}, ${entry.countryName}` : entry.city,
    icon: entry.country ? (
      <CountryFlag countryCode={entry.country} imgType="png" alt="" className="shrink-0" />
    ) : (
      <GlobeIcon className="size-4 text-faint-foreground" />
    ),
    detail: entry.offsetLabel,
    keywords: `${entry.zone} ${entry.genericName} ${entry.offsetLabel}`,
    city: entry.city,
    // Under its country's heading a row names its zone, which tells New York from Chicago
    subtitle: entry.country && !countryZones.includes(entry) ? entry.countryName : entry.genericName,
  }));

  return (
    <ComboboxFormField
      {...props}
      options={options}
      suggested={suggested}
      renderOption={(option) => (
        <>
          <span className="shrink-0">{option.city}</span>
          <span className="truncate text-faint-foreground">{option.subtitle}</span>
        </>
      )}
      clearable
      placeholders={{ trigger: 'c:placeholder.select_timezone', resource: 'c:timezone' }}
    />
  );
}
