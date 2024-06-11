import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Combobox from '~/modules/ui/combobox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { ContextEntity } from '~/types';

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

const SelectParentFormField = ({ collection, control, name, label, type, placeholder, required, disabled }: Props) => {
  const { menu } = useNavigationStore();
  const { t } = useTranslation();
  const options = menu[collection].items.map((item) => ({ value: item.id, label: item.name, url: item.thumbnailUrl }));
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
              placeholder={t('common:select_resource', { resource: t(`common:${type.toLowerCase()}`).toLowerCase() })}
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
