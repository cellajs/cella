import type { Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MultipleSelector from '~/modules/common/multi-select';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';

type Props = {
  control: Control;
  label: string;
  description?: string;
  required?: boolean;
};

const DomainsFormField = ({ control, label, description, required }: Props) => {
  const { t } = useTranslation();
  return (
    <FormField
      control={control}
      name={'emailDomains'}
      render={({ field: { onChange, value } }) => {
        const defaultValue = value ? value.map((val: string) => ({ label: val, value: val })) : [];
        return (
          <FormItem>
            <FormLabel>
              {label}
              {required && <span className="ml-1 opacity-50">*</span>}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormControl>
              <>
                <MultipleSelector
                  formControlName="emailDomains"
                  // value={defaultValue}
                  onChange={(value) => {
                    onChange(value.map((domain) => domain.value));
                  }}
                  defaultOptions={defaultValue}
                  creatable
                  createPlaceholder={t('common:add_domain')}
                  hidePlaceholderWhenSelected
                  placeholder={t('common:placeholder.email_domains')}
                />
              </>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default DomainsFormField;
