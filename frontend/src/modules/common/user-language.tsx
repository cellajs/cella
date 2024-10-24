import { config } from 'config';
import { updateSelf } from '~/api/me';
import { i18n } from '~/lib/i18n';
import { showToast } from '~/lib/toasts';
import CountryFlag from '~/modules/common/country-flag';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useUserStore } from '~/store/user';
import type { Language } from '~/types/common';

interface Props {
  size?: number;
  align?: 'start' | 'end';
  className?: string;
}

const UserLanguage = ({ align = 'end', className = '' }: Props) => {
  const { user, updateUser } = useUserStore();
  const language = i18n.resolvedLanguage || i18n.language;
  const changeLanguage = (lng: Language) => {
    if (!user) return;
    updateSelf({ language: lng }).then((res) => {
      updateUser(res);
    });
    if (window.Gleap) window.Gleap.setLanguage(lng);
    i18n.changeLanguage(lng);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label="Change language">
          <span className="font-light">{language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-48">
        {config.languages.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.value}
            checked={language === item.value}
            onCheckedChange={() => {
              if (item.value === 'nl') showToast('NL (Dutch) language will be available upon release.', 'info');
              changeLanguage(item.value);
            }}
          >
            <CountryFlag countryCode={item.value} imgType="png" />
            <span className="ml-2">{item.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserLanguage;
