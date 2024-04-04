import type { ReactNode } from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

interface Props {
  control: Control<FieldValues>;
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
  icon?: ReactNode;
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
  icon,
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
          <div className="relative flex w-full items-center ">
            {icon && <div className="pr-2 ">{icon}</div>}
            {type === 'textarea' ? (
              <Textarea
                placeholder={placeholder}
                autoResize={true}
                defaultValue={defaultValue}
                value={value || formFieldValue || ''}
                disabled={disabled}
                {...rest}
              />
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
