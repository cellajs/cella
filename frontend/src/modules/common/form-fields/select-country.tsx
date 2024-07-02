import { useTranslation } from 'react-i18next';
import countries from '~/json/countries.json';
import Combobox from '~/modules/ui/combobox';
import CountryFlag from '../country-flag';

const SelectCountry = ({ onChange }: { onChange: (value: string) => void }) => {
  const { t } = useTranslation();
  const options = getCountries(countries);

  const renderCountryOption = (option: { value: string; label: string }) => (
    <div className="flex items-center flex-nowrap truncate">
      <CountryFlag countryCode={option.value} imgType="png" className="mr-2 shrink-0" />
      <span className="truncate">{option.label}</span>
    </div>
  );
  return (
    <Combobox
      contentWidthMatchInput={true}
      options={options}
      name="country"
      onChange={onChange}
      placeholder={t('common:placeholder.select_country')}
      searchPlaceholder={t('common:placeholder.search_country')}
      renderOption={renderCountryOption}
    />
  );
};

export default SelectCountry;

const getCountries = (countriesArray: { code: string; name: string }[]) => {
  return countriesArray.map((country) => ({ value: country.code, label: country.name }));
};
