import { useEffect, useState } from 'react';
import { type Control, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import emailProviders from '~/../../restricted-email-providers.json';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { TagInput } from '~/modules/ui/tag-input';

type Props = {
  control: Control;
  label: string;
  description?: string;
  required?: boolean;
};

const DomainsFormField = ({ control, label, description, required }: Props) => {
  const { t } = useTranslation();

  const { getValues } = useFormContext();
  const formValue = getValues('emailDomains');

  const [fieldActive, setFieldActive] = useState(false);
  const [domains, setDomains] = useState<string[]>(formValue.map((dom: string) => dom));
  const [currentValue, setCurrentValue] = useState('');

  const checkValidInput = (value: string) => {
    if (!value || value.trim().length < 2) return true;
    return checkValidDomain(value);
  };

  const checkValidDomain = (domain: string) => {
    const trimDomain = domain.trim();
    // Regex to check if domain follows valid format
    const regexTest = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/i.test(trimDomain);

    // Check if domain is in restricted list of email providers
    const restrictDomainsTest = emailProviders.some((provider) => provider === trimDomain);

    // Return true if valid domain and not restricted, false otherwise
    return regexTest && !restrictDomainsTest;
  };

  useEffect(() => setDomains(formValue.map((dom: string) => dom)), [formValue]);

  return (
    <FormField
      control={control}
      name="emailDomains"
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
                inputProps={{ value: currentValue }}
                tagListPlacement="inside"
                onInputChange={(newValue) => setCurrentValue(newValue)}
                onFocus={() => setFieldActive(true)}
                onBlur={() => {
                  if (checkValidDomain(currentValue)) setDomains((prev) => [...prev, currentValue]);
                  setCurrentValue('');
                  setFieldActive(false);
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
                styleClasses={{
                  tag: {
                    body: 'pr-0 gap-0.5',
                    closeButton: 'h-6 w-6 ring-inset focus-visible:ring-2 p-0 rounded-full hover:bg-transparent cursor-pointer',
                  },
                  input: `${
                    fieldActive
                      ? !checkValidInput(currentValue)
                        ? 'ring-2 focus-visible:ring-2 ring-red-500 focus-visible:ring-red-500'
                        : 'max-sm:ring-offset-0  max-sm:ring-transparent ring-2 ring-offset-2 ring-white'
                      : ''
                  }`,
                }}
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
