import { useState } from 'react';
import { type FieldValues, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { BaseFormFieldProps } from '~/modules/common/form-fields/type';
import { FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/field';
import { TagInput } from '~/modules/ui/tag-input';

type DomainsFieldProps<TFieldValues extends FieldValues> = BaseFormFieldProps<TFieldValues> & {
  description?: string;
};

export function DomainsFormField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
}: DomainsFieldProps<TFieldValues>) {
  const { t } = useTranslation();

  const { getValues } = useFormContext();
  const formValue = getValues(name);

  const domains: string[] = formValue.map((dom: string) => dom);
  const [currentValue, setCurrentValue] = useState('');

  const isValidInput = (value: string) => {
    if (!value || value.trim().length < 2) return true;
    return checkValidDomain(value);
  };

  const checkValidDomain = (domain: string) => {
    return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/i.test(domain.trim());
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { onChange } }) => {
        return (
          <FormItem>
            <FormLabel help={description}>
              {label}
              {required && <span className="ml-1 opacity-50">*</span>}
            </FormLabel>
            <TagInput
              inputProps={{ value: currentValue, 'aria-invalid': !isValidInput(currentValue) }}
              onInputChange={(newValue) => setCurrentValue(newValue)}
              onBlur={() => {
                if (checkValidDomain(currentValue)) {
                  onChange([...domains, currentValue]);
                }
                setCurrentValue('');
              }}
              maxLength={100}
              minLength={4}
              placeholder={t('c:placeholder.email_domains')}
              tags={domains}
              setTags={(newTags) => {
                if (Array.isArray(newTags)) onChange(newTags.map((tag) => tag));
                setCurrentValue('');
              }}
              validateTag={checkValidDomain}
            />
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
