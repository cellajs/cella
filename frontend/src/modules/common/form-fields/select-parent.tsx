import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Control } from 'react-hook-form';
import Combobox from '~/modules/ui/combobox';
import { useTranslation } from 'react-i18next';

interface Props {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  collection: 'organizations' | 'workspaces' | 'projects';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

const SelectParentFormField = ({ collection, control, name, label, placeholder, required, disabled }: Props) => {
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
              options={options}
              name={`${collection.slice(0, -1)}Id`}
              onChange={onChange}
              placeholder={t('common:choose_from', { option: collection })}
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
