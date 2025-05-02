import { type Language, config } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CountryFlag from '~/modules/common/country-flag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

interface SelectLanguageProps {
  value: Language;
  options: Language[];
  onChange: (value: Language) => void;
}

export const SelectLanguage = ({ value, options, onChange }: SelectLanguageProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Select
      name="language"
      disabled={config.languages.length < 2}
      open={open}
      onOpenChange={setOpen}
      onValueChange={(lang: Language) => {
        onChange(lang);
      }}
      value={value}
    >
      <SelectTrigger aria-expanded={open} className="w-full">
        <SelectValue placeholder={t('common:placeholder.select_language')} />
      </SelectTrigger>
      <SelectContent>
        {config.languages.map((lang) => {
          const disabled = !options.includes(lang);
          return (
            <SelectItem key={lang} value={lang} disabled={disabled} className="truncate">
              <CountryFlag countryCode={lang} imgType="png" className="mr-2 shrink-0" />
              <span className="truncate">{t(`common:${lang}`)}</span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
