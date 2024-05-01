import type { ReactNode } from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

interface Props<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: keyof TFieldValues;
  label: string;
  value?: string;
  defaultValue?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  description?: string;
  placeholder?: string;
  onFocus?: () => void;
  minimal?: boolean;
  prefix?: string;
  subComponent?: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  inputClassName?: string;
}

const InputFormField = <TFieldValues extends FieldValues>({
  control,
  name,
  label,
  value,
  defaultValue,
  description,
  onFocus,
  type = 'text',
  placeholder,
  subComponent,
  required,
  prefix,
  disabled,
  icon,
  inputClassName,
}: Props<TFieldValues>) => {
  const havePrefix = prefix !== 'undefined' && prefix;
  const spanPrefix = document.querySelector(`#${prefix}-prefix`);
  const prefixPadding = havePrefix && spanPrefix && 'offsetWidth' in spanPrefix ? `${Number(spanPrefix.offsetWidth) + 10}px` : '12px';
  return (
    <FormField
      control={disabled ? undefined : control}
      name={name as Path<TFieldValues>}
      render={({ field: { value: formFieldValue, ...rest } }) => (
        <FormItem name={name?.toString()}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <div className="relative flex w-full items-center ">
              {icon && <div className="pr-2 ">{icon}</div>}
              {havePrefix && <span id={`${prefix}-prefix`} className="absolute left-2 text-sm opacity-50">{`cellajs.com/${prefix}/`}</span>}
              {type === 'textarea' ? (
                <Textarea
                  placeholder={placeholder}
                  onFocus={onFocus}
                  autoResize={true}
                  defaultValue={defaultValue}
                  value={value || formFieldValue || ''}
                  disabled={disabled}
                  {...rest}
                />
              ) : (
                <Input
                  className={inputClassName}
                  style={{ paddingLeft: prefixPadding }}
                  type={type}
                  onFocus={onFocus}
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
};

export default InputFormField;
