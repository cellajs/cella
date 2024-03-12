import type { Control } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

interface Props {
  control: Control;
  name: string;
  label: string;
  value?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  description?: string;
  placeholder?: string;
  subComponent?: React.ReactNode;
  disabled?: boolean;
}

const InputFormField = ({ control, name, label, value, description, type = 'text', placeholder, subComponent, disabled }: Props) => (
  <FormField
    control={control}
    name={name}
    render={({ field: { value: formFieldValue, ...rest } }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        {description && <FormDescription>{description}</FormDescription>}
        <FormControl>
          <div className="relative">
            {type === 'textarea' ? (
              <Textarea placeholder={placeholder} value={value || formFieldValue || ''} disabled={disabled} {...rest} />
            ) : (
              <Input type={type} placeholder={placeholder} value={value || formFieldValue || ''} disabled={disabled} {...rest} />
            )}
            {subComponent}
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

export default InputFormField;
