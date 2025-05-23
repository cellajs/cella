import { useMemo } from 'react';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { ContextEntityType } from 'config';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import Combobox from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  parentType: keyof UserMenu;
  entityType: ContextEntityType;
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

const SelectParentFormField = ({ parentType, control, name, label, entityType, placeholder, required, disabled }: Props) => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();

  const options = useMemo(() => menu[parentType]?.map((item) => convertItemToOption(item)) || [], [menu, parentType, control, name]);

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
              placeholder={t('common:select_resource', { resource: t(`common:${entityType}`).toLowerCase() })}
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
