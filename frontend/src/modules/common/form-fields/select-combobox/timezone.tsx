import timezones from '#json/timezones.json';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import Combobox from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

const SelectTimezone = <TFieldValues extends FieldValues>({ control, name, disabled, label, required }: BaseFormFieldProps<TFieldValues>) => {
  const { t } = useTranslation();

  const options = timezones.map(({ utc, text }) => ({ value: utc[0], label: text }));

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
              disabled={disabled}
              placeholders={{
                trigger: t('common:placeholder.select_timezone'),
                search: t('common:placeholder.search_timezone'),
                notFound: t('common:no_resource_found', { resource: t('common:timezone').toLowerCase() }),
              }}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectTimezone;
