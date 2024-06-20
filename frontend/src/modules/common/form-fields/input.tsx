import { type ReactNode, useEffect, useState, useRef } from 'react';
import { type Control, type FieldValues, type Path, useFormContext } from 'react-hook-form';
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
  const { setFocus } = useFormContext();
  const [prefixPadding, setPrefixPadding] = useState('12px');
  const [subComponentPadding, setSubComponentPadding] = useState('12px');
  const prefixRef = useRef<HTMLSpanElement>(null);
  const subComponentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefix && prefixRef.current) {
      const prefixRefWidth = prefixRef.current.offsetWidth;
      const prefixWidth = prefixRefWidth === 0 ? prefix.length * 6 : prefixRefWidth;
      setPrefixPadding(`${prefixWidth + 16}px`);
    }
    if (subComponent && subComponentRef.current) {
      setSubComponentPadding(`${subComponentRef.current.offsetWidth}px`);
    }
  }, [subComponent, prefix]);

  const prefixClick = () => {
    setFocus(name.toString());
  };

  return (
    <FormField
      control={disabled ? undefined : control}
      name={name as Path<TFieldValues>}
      render={({ field: { value: formFieldValue, ...rest } }) => (
        <FormItem name={name.toString()}>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <div className="relative flex w-full items-center ">
              {(prefix || icon) && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                <span
                  ref={prefixRef}
                  onClick={prefixClick}
                  className="absolute font-light left-3 text-sm"
                  style={{ opacity: value || formFieldValue ? 1 : 0.5 }}
                >
                  {prefix || icon}
                </span>
              )}
              {type === 'textarea' ? (
                <Textarea
                  style={{ paddingLeft: prefix ? prefixPadding : icon ? '2rem' : '' }}
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
                  style={{ paddingLeft: prefix ? prefixPadding : icon ? '2rem' : '', paddingRight: subComponentPadding }}
                  type={type}
                  onFocus={onFocus}
                  placeholder={placeholder}
                  defaultValue={defaultValue}
                  value={value || formFieldValue || ''}
                  disabled={disabled}
                  {...rest}
                />
              )}
              <div ref={subComponentRef}>{subComponent}</div>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default InputFormField;
