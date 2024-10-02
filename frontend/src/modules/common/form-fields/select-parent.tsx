import { useMemo } from 'react';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import Combobox from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity, UserMenu, UserMenuItem } from '~/types/common';

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  collection: keyof UserMenu;
  type: ContextEntity;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const convertItemToOption = (item: UserMenuItem) => {
  return {
    value: item.id,
    label: item.name,
    url: item.thumbnailUrl,
  };
};

const SelectParentFormField = ({ collection, control, name, label, type, placeholder, required, disabled }: Props) => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();

  const options = useMemo(() => menu[collection]?.map((item) => convertItemToOption(item)) || [], [menu, collection, control, name]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange } }) => (
        <FormItem name={name} aria-disabled={disabled}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          <FormControl>
            <Combobox
              contentWidthMatchInput={true}
              options={options}
              name={name}
              onChange={onChange}
              disabled={disabled}
              placeholder={t('common:select_resource', { resource: t(`common:${type}`).toLowerCase() })}
              searchPlaceholder={placeholder ? placeholder : t('common:search')}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectParentFormField;
