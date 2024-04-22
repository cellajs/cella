import CountryFlag from '~/modules/common/country-flag';

import { useTranslation } from 'react-i18next';
import countries from '~/json/countries.json';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

const SelectCountry = ({ onChange, value }: { onChange: (value: string) => void; value: string }) => {
  const { t } = useTranslation();
  return (
    <Select onValueChange={onChange} value={value || ''}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('common:placeholder.select_country')} />
      </SelectTrigger>
      <SelectContent className="h-[30vh]">
        {countries.map((country) => (
          <SelectItem key={country.code} value={country.name}>
            <CountryFlag countryCode={country.code} imgType="png" className="mr-2" />
            {country.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectCountry;
