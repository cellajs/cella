import countries from '~/json/countries.json';
import { useTranslation } from 'react-i18next';
import Combobox from '~/modules/ui/combobox';
import CountryFlag from '../country-flag';

const SelectCountry = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const { t } = useTranslation();
  const options = countries.map((country) => ({ value: country.name, shownText: country.name }));

  const renderCountryOption = (option: { value: string; shownText: string }) => (
    <div className="flex items-center">
      <CountryFlag countryCode={countries.find((c) => c.name === option.value)?.code || ''} imgType="png" className="mr-2" />
      {option.shownText}
    </div>
  );
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={t('common:placeholder.select_country')}
      searchPlaceholder={t('common:placeholder.search_country')}
      renderOption={renderCountryOption}
    />
  );
};

export default SelectCountry;
