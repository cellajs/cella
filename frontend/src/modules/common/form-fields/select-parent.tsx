import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useNavigationStore } from '~/store/navigation';
import type { Control } from 'react-hook-form';

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
            <Select onValueChange={onChange} value={value} required disabled={disabled}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={placeholder ? placeholder : ''} />
              </SelectTrigger>
              <SelectContent>
                {menu[collection].items.map((item) => (
                  <SelectItem onClick={() => onChange(item.id)} className="cursor-pointer" key={item.id} value={item.id}>
                    {item.name}
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

export default SelectParentFormField;
