import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type Control, type FieldValues, type Path, useFormContext } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';

//TODO: can this be refactored into separate components for textarea and input, and also get rid of subcomponent and prefix?
// subcomponent and prefix are only used by the slug field, so lets make a third component for that.

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
  prefix?: string;
  subComponent?: React.ReactNode;
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
  subComponent,
  required,
  readOnly,
  prefix,
  disabled,
  icon,
  autoFocus,
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
    if (subComponent && subComponentRef.current?.children[0]) {
      const element = subComponentRef.current?.children[0] as HTMLElement | undefined;
      if (element) setSubComponentPadding(`${element.offsetWidth + 6}px`);
    }
    if (!subComponent) setSubComponentPadding('12px');
    if (!prefix) setSubComponentPadding('12px');
  }, [subComponent, prefix]);

  const prefixClick = () => {
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
              {(prefix || icon) && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
                <span
                  ref={prefixRef}
                  onClick={prefixClick}
                  className="absolute font-light left-3 text-xs"
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
                  readOnly={readOnly}
                  autoResize={true}
                  autoFocus={autoFocus}
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
                  autoFocus={autoFocus}
                  onFocus={onFocus}
                  placeholder={placeholder}
                  readOnly={readOnly}
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
