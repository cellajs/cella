import { useTranslation } from 'react-i18next';
import timezones from '~/json/timezones.json';
import Combobox from '~/modules/ui/combobox';

const SelectTimezone = ({ onChange }: { onChange: (value: string) => void }) => {
  const { t } = useTranslation();
  const options = timezones.map((timezone) => ({ value: timezone.utc[0], label: timezone.text }));

  return (
    <Combobox
      options={options}
      name="timezone"
      onChange={onChange}
      placeholder={t('common:placeholder.select_timezone')}
      searchPlaceholder={t('common:placeholder.search_timezone')}
    />
  );
};

export default SelectTimezone;
