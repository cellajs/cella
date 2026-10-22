import { useTranslation } from 'react-i18next';
import type { Language } from 'shared';
import { ResponsiveSelect } from '~/modules/common/form-fields/responsive-select';

interface SelectLanguageProps {
  value: Language;
  options: Language[];
  onChange: (value: Language) => void;
}

export function SelectLanguage({ value, options, onChange }: SelectLanguageProps) {
  const { t } = useTranslation();

  const selectOptions = options.map((lang) => ({ value: lang, label: t(`c:${lang}`), lang }));

  return (
    <ResponsiveSelect
      options={selectOptions}
      value={value}
      onChange={(lang) => onChange(lang as Language)}
      placeholder={t('c:placeholder.select_language')}
      disabled={options.length < 2}
      className="w-full"
    />
  );
}
