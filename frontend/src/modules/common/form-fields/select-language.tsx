import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { ResponsiveSelect } from '~/modules/ui/responsive-select';

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

  const selectOptions = options.map((lang) => ({
    value: lang,
    label: t(`common:${lang}`),
  }));

  return (
    <ResponsiveSelect
      options={selectOptions}
      value={value}
      onChange={(val) => onChange(val as Language)}
      placeholder={t('common:placeholder.select_language')}
      disabled={appConfig.languages.length < 2}
      className="w-full"
    />
  );
};
