import type { FieldValues } from 'react-hook-form';
import timezones from '#json/timezones.json';
import { ComboboxFormField } from '~/modules/common/form-fields/select-combobox/combobox-select';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';

const seen = new Set<string>();
const options = timezones.reduce<{ value: string; label: string }[]>((acc, { utc, text }) => {
  const value = utc[0];
  if (value && !seen.has(value)) {
    seen.add(value);
    acc.push({ value, label: text });
  }
  return acc;
}, []);

export function TimezoneFormField<TFieldValues extends FieldValues>(props: BaseFormFieldProps<TFieldValues>) {
  return (
    <ComboboxFormField {...props} options={options} clearable placeholders={{ trigger: 'c:placeholder.select_timezone', resource: 'c:timezone' }} />
  );
}
