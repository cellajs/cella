import type { ReactNode } from 'react';
import type { FieldValues } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';
import { cn } from '~/utils/cn';

type InputFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  description?: string;
  value?: string;
  defaultValue?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  minimal?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  autoFocus?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  autocomplete?: string;
};

export function InputFormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  value,
  defaultValue,
  description,
  onFocus,
  onBlur,
  type = 'text',
  placeholder,
  required,
  readOnly,
  disabled,
  icon,
  autoFocus,
  inputClassName,
  labelClassName,
  autocomplete = 'off',
}: InputFieldProps<TFieldValues>) {
  const InputComponent = type === 'textarea' ? Textarea : Input;

  return (
    <FormField
      control={disabled ? undefined : control}
      name={name}
      render={({ field: { value: formFieldValue, onBlur: fieldOnBlur, ...rest } }) => (
        <FormItem name={name.toString()}>
          <FormLabel help={description} className={labelClassName}>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          <div className="relative flex w-full items-center">
            {icon && (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute left-3 flex size-4 items-center justify-center text-xs',
                  type === 'textarea' ? 'top-3' : 'top-1/2 -translate-y-1/2',
                )}
                style={{ opacity: value || formFieldValue ? 1 : 0.5 }}
              >
                {icon}
              </span>
            )}
            <FormControl>
              <InputComponent
                className={cn(inputClassName, icon && 'pl-10')}
                placeholder={placeholder}
                onFocus={onFocus}
                onBlur={() => {
                  fieldOnBlur();
                  onBlur?.();
                }}
                readOnly={readOnly}
                type={type}
                autoComplete={autocomplete}
                autoFocus={autoFocus}
                defaultValue={defaultValue}
                value={value || formFieldValue || ''}
                disabled={disabled}
                {...(type === 'textarea' ? { autoResize: true } : {})}
                {...rest}
              />
            </FormControl>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
