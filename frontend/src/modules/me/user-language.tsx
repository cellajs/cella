import { onlineManager } from '@tanstack/react-query';
import { appConfig, type Language } from 'config';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { updateMe } from '~/api.gen';
import CountryFlag from '~/modules/common/country-flag';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/modules/ui/dropdown-menu';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

interface Props {
  size?: number;
  align?: 'start' | 'end';
  triggerClassName?: string;
  contentClassName?: string;
}

const UserLanguage = ({ align = 'end', triggerClassName = '', contentClassName = '' }: Props) => {
  const { t } = useTranslation();

  const { user, updateUser } = useUserStore();
  const language = user?.language || i18n.languages[0];

  const changeLanguage = (lng: Language) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
    if (window.Gleap) window.Gleap.setLanguage(lng);
    i18n.changeLanguage(lng);

    if (!user) return;
    updateMe({ body: { language: lng } }).then((res) => {
      updateUser(res);
    });
  };

  if (appConfig.languages.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName} aria-label="Change language">
          <span className="font-[400]">{language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('w-48 p-1', contentClassName)}>
        {appConfig.languages.map((lang) => (
          <DropdownMenuCheckboxItem
            key={lang}
            checked={language === lang}
            onCheckedChange={() => {
              changeLanguage(lang);
            }}
          >
            <CountryFlag countryCode={lang} imgType="png" />
            <span className="ml-2">{t(`common:${lang}`)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserLanguage;
