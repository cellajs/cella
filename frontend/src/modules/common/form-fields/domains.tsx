import { type Tag, TagInput } from 'emblor';
import { useEffect, useState } from 'react';
import { type Control, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

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
  const [domains, setDomains] = useState<Tag[]>(formValue.map((dom: string) => ({ id: dom, text: dom })));
  const [currentValue, setCurrentValue] = useState('');

  const checkValidInput = (value: string) => {
    if (!value || value.trim().length < 2) return true;
    return checkValidDomain(value);
  };

  const checkValidDomain = (domain: string) => {
    return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/i.test(domain.trim());
  };

  useEffect(() => {
    setDomains(formValue.map((dom: string) => ({ id: dom, text: dom })));
  }, [formValue]);

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
                onInputChange={(newValue) => setCurrentValue(newValue)}
                onFocus={() => setFieldActive(true)}
                onBlur={() => {
                  if (checkValidDomain(currentValue)) setDomains((prev) => [...prev, { id: currentValue, text: currentValue }]);
                  setCurrentValue('');
                  setFieldActive(false);
                }}
                maxLength={100}
                minLength={4}
                placeholder={t('common:placeholder.email_domains')}
                tags={domains}
                allowDuplicates={false}
                setTags={(newTags) => {
                  setDomains(newTags);
                  if (Array.isArray(newTags)) onChange(newTags.map((tag) => tag.text));
                  setCurrentValue('');
                }}
                validateTag={checkValidDomain}
                activeTagIndex={null}
                setActiveTagIndex={() => {}}
                styleClasses={{
                  input: 'px-1 py-0 h-[1.38rem] shadow-none',
                  tag: { body: 'h-7 py-0 rounded-full -m-1 gap-1', closeButton: 'h-6 mr-0.5 w-6 ring-inset focus-visible:ring-2 p-0 rounded-full' },
                  inlineTagsContainer: `${fieldActive ? (!checkValidInput(currentValue) ? 'ring-2 focus-visible:ring-2 ring-red-500 focus-visible:ring-red-500' : 'max-sm:ring-offset-0  max-sm:ring-transparent ring-2 ring-offset-2 ring-white') : ''}`,
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
