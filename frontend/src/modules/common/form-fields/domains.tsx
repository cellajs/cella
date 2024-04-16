import { config } from 'config';
import type { Control } from 'react-hook-form';
import MultipleSelector from '~/modules/common/multi-select';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { useTranslation } from 'react-i18next';

type Props = {
  control: Control;
  name: string;
  label: string;
  placeholder?: string;
  description?: string;
  disabledItemFunction?: (value: string) => boolean;
  emptyIndicator?: string;
  required?: boolean;
};

const DomainsFormField = ({
  control,
  name,
  label,
  description,
  placeholder,
  emptyIndicator,
  required,
}: Props) => {
  const { t } = useTranslation();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <FormItem>
          <FormLabel>
            {label}
            {required && <span className="ml-1 opacity-50">*</span>}
          </FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
          
              <>
                <MultipleSelector
                  value={config.languages.filter((language) => value?.includes(language.value))}
                  onChange={(value) => {
                    onChange(value.map((language) => language.value));
                  }}
                  creatable
                  createPlaceholder={t('common:add_domain')}
                  hidePlaceholderWhenSelected
                  placeholder={placeholder}
                  emptyValue={emptyIndicator}
                />
              </>
          
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default DomainsFormField;
