import { useMemo } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import type { UserMenu } from '~/modules/me/types';
import Combobox, { type ComboboxProps } from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';

type SelectParentProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  parentType: keyof UserMenu;
  options?: ComboboxProps['options'];
};

const SelectParentFormField = <TFieldValues extends FieldValues>({
  parentType,
  control,
  name,
  label,
  options: passedOptions,
  required,
  disabled,
}: SelectParentProps<TFieldValues>) => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();

  // Derive combobox options
  const options = useMemo(() => {
    if (passedOptions) return passedOptions;

    const parentItems = menu[parentType] ?? [];
    return parentItems.map(({ id, name, thumbnailUrl }) => ({
      value: id,
      label: name,
      url: thumbnailUrl,
    }));
  }, [passedOptions, menu, parentType]);

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
              renderAvatar
              placeholders={{
                trigger: t('common:select_resource', { resource: t(`common:${parentType}`).toLowerCase() }),
                search: t('common:placeholder.search'),
                notFound: t('common:no_resource_found', { resource: t(`common:${parentType}`).toLowerCase() }),
              }}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectParentFormField;
