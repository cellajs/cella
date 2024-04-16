import { config } from 'config';
import type { Control } from 'react-hook-form';
import MultipleSelector from '~/modules/common/multi-select';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import CountryFlag from '../country-flag';
import { useTranslation } from 'react-i18next';

type Props = {
  control: Control;
  name: string;
  label: string;
  placeholder?: string;
  mode?: 'single' | 'multiple';
  description?: string;
  disabledItemFunction?: (value: string) => boolean;
  emptyIndicator?: string;
  required?: boolean;
};

const LanguageFormField = ({
  mode = 'single',
  control,
  name,
  label,
  description,
  placeholder,
  disabledItemFunction,
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
            {mode === 'single' ? (
              <Select onValueChange={onChange} value={value || ''}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {config.languages.map((language: { value: string; label: string }) => (
                    <SelectItem key={language.value} value={language.value} disabled={disabledItemFunction?.(language.value)}>
                      <CountryFlag countryCode={language.value} imgType="png" className="mr-2" />
                      {language.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <MultipleSelector
                  value={config.languages.filter((language) => value?.includes(language.value))}
                  onChange={(value) => {
                    onChange(value.map((language) => language.value));
                  }}
                  basicSignValue={t('common:placeholder.select_languages')}
                  hidePlaceholderWhenSelected
                  defaultOptions={config.languages}
                  itemComponent={(item) => (
                    <div className="h-8 flex items-center px-1">
                      <CountryFlag countryCode={item.value} imgType="png" className="mr-2" />
                      {item.label}
                    </div>
                  )}
                  placeholder={placeholder}
                  emptyValue={emptyIndicator}
                />
              </>
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default LanguageFormField;
