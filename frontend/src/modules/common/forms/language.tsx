import { config } from 'config';
import { Control } from 'react-hook-form';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '~/modules/ui/form';
import MultipleSelector from '~/modules/ui/multiple-selector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import CountryFlag from '../country-flag';

type Props = {
  control: Control;
  name: string;
  label: string;
  placeholder?: string;
  mode?: 'single' | 'multiple';
  description?: string;
  disabledItemFunction?: (value: string) => boolean;
  emptyIndicator?: string;
};

const LanguageFormField = ({ mode = 'single', control, name, label, description, placeholder, disabledItemFunction, emptyIndicator }: Props) => (
  <FormField
    control={control}
    name={name}
    render={({ field: { value, onChange } }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
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
            <MultipleSelector
              value={config.languages.filter((language) => value?.includes(language.value))}
              onChange={(value) => {
                onChange(value.map((language) => language.value));
              }}
              defaultOptions={config.languages}
              placeholder={placeholder}
              emptyIndicator={emptyIndicator}
            />
          )}
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

export default LanguageFormField;
