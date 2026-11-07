import type { FieldValues } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

type SelectFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  options: { value: string; label: string }[];
  description?: string;
};

export function SelectFormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  options,
}: SelectFormFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem name={name}>
          <FormLabel help={description} required={required}>
            {label}
          </FormLabel>
          <Select value={field.value} onValueChange={field.onChange} items={options} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
