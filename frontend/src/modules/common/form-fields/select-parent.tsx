import { useMemo } from 'react';
import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useGetEntity } from '~/hooks/use-get-entity-minimum-info';
import Combobox from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity, MinimumEntityItem } from '~/types';

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  collection: 'organizations' | 'workspaces';
  type: ContextEntity;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const convertItemToOption = (item: MinimumEntityItem) => {
  return {
    value: item.id,
    label: item.name,
    url: item.thumbnailUrl,
  };
};

const SelectParentFormField = ({ collection, control, name, label, type, placeholder, required, disabled }: Props) => {
  const { t } = useTranslation();
  const { menu } = useNavigationStore();

  const options = useMemo(() => {
    const menuOptions = menu[collection]?.map((item) => convertItemToOption(item)) || [];

    if (menuOptions.length > 0) return menuOptions;

    const { _defaultValues } = control;
    const entityId = _defaultValues[name];
    const entity = useGetEntity(entityId, name.replace('Id', '') as ContextEntity);

    return [convertItemToOption(entity)];
  }, [menu, collection, control, name]);

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
