import type { ReactNode } from 'react';
import { type FieldValues, useFormContext } from 'react-hook-form';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
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
  minimal?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  autoFocus?: boolean;
  inputClassName?: string;
  autocomplete?: string;
};

export const InputFormField = <TFieldValues extends FieldValues>({
  control,
  name,
  label,
  value,
  defaultValue,
  description,
  onFocus,
  type = 'text',
  placeholder,
  required,
  readOnly,
  disabled,
  icon,
  autoFocus,
  inputClassName,
  autocomplete = 'off',
}: InputFieldProps<TFieldValues>) => {
  const { setFocus } = useFormContext();

  const InputComponent = type === 'textarea' ? Textarea : Input;

  const iconClick = () => {
    setFocus(name.toString());
  };

  return (
    <FormField
      control={disabled ? undefined : control}
      name={name}
      render={({ field: { value: formFieldValue, ...rest } }) => (
        <FormItem name={name.toString()}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <div className="relative flex w-full items-center ">
              {icon && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={iconClick}
                  className="absolute font-light left-3 text-xs"
                  style={{ opacity: value || formFieldValue ? 1 : 0.5 }}
                >
                  {icon}
                </button>
              )}
              <InputComponent
                className={cn(inputClassName, icon && 'pl-10')}
                placeholder={placeholder}
                onFocus={onFocus}
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
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
