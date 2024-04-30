import { useTranslation } from 'react-i18next';
import timezones from '~/json/timezones.json';
import Combobox from '~/modules/ui/combobox';

const SelectTimezone = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const { t } = useTranslation();
  const options = timezones.map((timezone) => ({ value: timezone.value, shownText: timezone.text }));

  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={t('common:placeholder.select_timezone')}
      searchPlaceholder={t('common:placeholder.search_timezone')}
    />
  );
};

export default SelectTimezone;
