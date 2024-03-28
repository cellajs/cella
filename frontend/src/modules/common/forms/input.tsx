import type { Control } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

interface Props {
  control: Control;
  name: string;
  label: string;
  value?: string;
  defaultValue?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  description?: string;
  placeholder?: string;
  subComponent?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
}

const InputFormField = ({
  control,
  name,
  label,
  value,
  defaultValue,
  description,
  type = 'text',
  placeholder,
  subComponent,
  required,
  disabled,
}: Props) => (
  <FormField
    control={disabled ? undefined : control}
    name={disabled ? '' : name}
    render={({ field: { value: formFieldValue, ...rest } }) => (
      <FormItem>
        <FormLabel>
          {label}
          {required && <span className="ml-1 opacity-50">*</span>}
        </FormLabel>
        {description && <FormDescription>{description}</FormDescription>}
        <FormControl>
          <div className="relative">
            {type === 'textarea' ? (
              <Textarea placeholder={placeholder} defaultValue={defaultValue} value={value || formFieldValue || ''} disabled={disabled} {...rest} />
            ) : (
              <Input
                type={type}
                placeholder={placeholder}
                defaultValue={defaultValue}
                value={value || formFieldValue || ''}
                disabled={disabled}
                {...rest}
              />
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
