import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

interface SelectLanguageProps {
  value: Language;
  options: Language[];
  onChange: (value: Language) => void;
}

/**
 * Dropdown select for picking a single language from the configured app languages.
 */
export const SelectLanguage = ({ value, options, onChange }: SelectLanguageProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Select
      name="language"
      disabled={appConfig.languages.length < 2}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(lang) => {
        onChange(lang as Language);
      }}
      value={value}
    >
      <SelectTrigger aria-expanded={open} className="w-full">
        <SelectValue placeholder={t('common:placeholder.select_language')} />
      </SelectTrigger>
      <SelectContent>
        {appConfig.languages.map((lang) => {
          const disabled = !options.includes(lang);
          return (
            <SelectItem key={lang} value={lang} disabled={disabled} className="truncate">
              <span className="truncate">{t(`common:${lang}`)}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
