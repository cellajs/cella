import { useEffect, useState } from 'react';
import { type FieldValues, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { TagInput } from '~/modules/ui/tag-input';

type DomainsFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  description?: string;
};
const DomainsFormField = <TFieldValues extends FieldValues>({ control, name, label, description, required }: DomainsFieldProps<TFieldValues>) => {
  const { t } = useTranslation();

  const { getValues } = useFormContext();
  const formValue = getValues(name);

  const [domains, setDomains] = useState<string[]>(formValue.map((dom: string) => dom));
  const [currentValue, setCurrentValue] = useState('');

  // Validate input while typing
  const isValidInput = (value: string) => {
    if (!value || value.trim().length < 2) return true;
    return checkValidDomain(value);
  };

  // Domain validation regex
  const checkValidDomain = (domain: string) => {
    return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/i.test(domain.trim());
  };

  useEffect(() => setDomains(formValue.map((dom: string) => dom)), [formValue]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange } }) => {
        return (
          <FormItem>
            <FormLabel>
              {label}
              {required && <span className="ml-1 opacity-50">*</span>}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <TagInput
                inputProps={{ value: currentValue, 'aria-invalid': !isValidInput(currentValue) }}
                onInputChange={(newValue) => setCurrentValue(newValue)}
                onBlur={() => {
                  if (checkValidDomain(currentValue)) {
                    setDomains((prev) => [...prev, currentValue]);
                    onChange([...domains, currentValue]);
                  }
                  setCurrentValue('');
                }}
                maxLength={100}
                minLength={4}
                placeholder={t('common:placeholder.email_domains')}
                tags={domains}
                setTags={(newTags) => {
                  setDomains(newTags);
                  if (Array.isArray(newTags)) onChange(newTags.map((tag) => tag));
                  setCurrentValue('');
                }}
                validateTag={checkValidDomain}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default DomainsFormField;
