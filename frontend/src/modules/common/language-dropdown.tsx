import { config } from 'config';

import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useUserStore } from '~/store/user';
import CountryFlag from './country-flag';

interface Props {
  size?: number;
  align?: 'start' | 'end';
  className?: string;
}

const LanguageDropdown = ({ align = 'end', className = '' }: Props) => {
  const { language, setLanguage } = useUserStore();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Change language">
          <span className="font-light">{language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        {config.languages.map((item) => (
          <DropdownMenuCheckboxItem key={item.value} checked={language === item.value} onCheckedChange={() => setLanguage(item.value)}>
            <CountryFlag countryCode={item.value} imgType="png" />
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageDropdown;
