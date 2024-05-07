import countries from '~/json/countries.json';
import { useTranslation } from 'react-i18next';
import Combobox from '~/modules/ui/combobox';
import CountryFlag from '../country-flag';

const SelectCountry = ({ onChange }: { onChange: (value: string) => void }) => {
  const { t } = useTranslation();
  const options = countries.map((country) => ({ value: country.code, label: country.name }));

  const renderCountryOption = (option: { value: string; label: string }) => (
    <div className="flex items-center">
      <CountryFlag countryCode={option.value} imgType="png" className="mr-2" />
      {option.label}
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
