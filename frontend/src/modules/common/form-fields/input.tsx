import type { ReactNode } from 'react';
import type { FieldValues } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/types';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';
import { cn } from '~/utils/cn';

type InputFormFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  description?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
  icon?: ReactNode;
  autoFocus?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  autoComplete?: string;
};

export function InputFormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
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
  autoComplete = 'off',
}: InputFormFieldProps<TFieldValues>) {
  const InputComponent = type === 'textarea' ? Textarea : Input;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value: formFieldValue, onBlur: fieldOnBlur, ...rest } }) => (
        <FormItem name={name}>
          <FormLabel help={description} className={labelClassName} required={required}>
            {label}
          </FormLabel>
          <div className="relative flex w-full items-center">
            {icon && (
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute left-3 flex size-4 items-center justify-center',
                  type === 'textarea' ? 'top-3' : 'top-1/2 -translate-y-1/2',
                  !formFieldValue && 'opacity-50',
                )}
              >
                {icon}
              </span>
            )}
            <FormControl>
              <InputComponent
                className={cn(icon && 'pl-10', inputClassName)}
                placeholder={placeholder}
                onFocus={onFocus}
                onBlur={() => {
                  fieldOnBlur();
                  onBlur?.();
                }}
                readOnly={readOnly}
                autoComplete={autoComplete}
                autoFocus={autoFocus}
                value={formFieldValue || ''}
                disabled={disabled}
                {...(type === 'textarea' ? { autoResize: true } : { type })}
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
