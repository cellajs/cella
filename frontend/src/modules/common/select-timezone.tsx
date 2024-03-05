import timezones from '~/lib/timezones.json';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { useTranslation } from 'react-i18next';

const SelectTimezone = ({ onChange, value }: { onChange: (value: string) => void; value: string }) => {
  const { t } = useTranslation();
  return (
    <Select onValueChange={onChange} value={value || ''}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('common:placeholder.select_timezone')} />
      </SelectTrigger>
      <SelectContent className="h-[300px]">
        {timezones.map((timezone) => (
          <SelectItem key={timezone.text} value={timezone.text}>
            {timezone.text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectTimezone;
