import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Control } from 'react-hook-form';

interface SelectOrganizationProps {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  control: Control<any>;
  name: string;
  label: string;
  required?: boolean;
}

const SelectOrganizationFormField = ({ control, name, label, required }: SelectOrganizationProps) => {
  const { menu } = useNavigationStore();
  const { t } = useTranslation();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem name={name}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          <FormControl>
            <Select onValueChange={onChange} value={value} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('common:select_organization')} />
              </SelectTrigger>
              <SelectContent className="h-[30vh]">
                {menu.organizations.items.map((organization) => (
                  <SelectItem onClick={() => onChange(organization.id)} className="cursor-pointer" key={organization.id} value={organization.id}>
                    {organization.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SelectOrganizationFormField;
