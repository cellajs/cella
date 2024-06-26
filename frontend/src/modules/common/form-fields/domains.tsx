import { useEffect, useState } from 'react';
import { useFormContext, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type Tag, TagInput } from 'emblor';
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
  const checkValidDomain = (domain: string) => {
    return /^[a-z0-9].*[a-z0-9]$/i.test(domain) && domain.includes('.');
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
                }}
                validateTag={checkValidDomain}
                activeTagIndex={null}
                setActiveTagIndex={() => {}}
                styleClasses={{
                  input: 'px-1 py-0 h-[22px]',
                  tag: { body: 'h-[22px] py-0' },
                  inlineTagsContainer: `${fieldActive ? 'ring-2 ring-offset-2 ring-white' : ''}`,
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
