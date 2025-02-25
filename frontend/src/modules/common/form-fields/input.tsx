import type { ReactNode } from 'react';
import { type Control, type FieldValues, type Path, useFormContext } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

interface Props<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  value?: string;
  defaultValue?: string;
  type?: Parameters<typeof Input>[0]['type'] | 'textarea';
  description?: string;
  placeholder?: string;
  onFocus?: () => void;
  minimal?: boolean;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  autoFocus?: boolean;
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
  required,
  readOnly,
  disabled,
  icon,
  autoFocus,
  inputClassName,
}: Props<TFieldValues>) => {
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
                className={inputClassName}
                style={{ paddingLeft: icon ? '2rem' : '' }}
                placeholder={placeholder}
                onFocus={onFocus}
                readOnly={readOnly}
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

export default InputFormField;
