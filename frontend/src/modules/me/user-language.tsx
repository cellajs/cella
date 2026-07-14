import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { CheckIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { updateMe } from 'sdk';
import { appConfig, type Language } from 'shared';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

interface Props {
  triggerClassName?: string;
}

export function UserLanguage({ triggerClassName = '' }: Props) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { user, updateUser } = useUserStore();
  const language = user?.language || i18n.languages[0];

  const changeLanguage = (lng: Language) => {
    if (!onlineManager.isOnline()) return toaster(t('c:action.offline.text'), 'warning');
    if (window.Gleap) window.Gleap.setLanguage(lng);
    i18n.changeLanguage(lng);
    useDropdowner.getState().remove();

    if (!user) return;
    updateMe({ body: { language: lng } }).then((res) => {
      updateUser(res);
    });
  };

  if (appConfig.languages.length < 2) return null;

  const openDropdown = () => {
    const currentLang = user?.language || i18n.languages[0];
    const isMobile = window.innerWidth < 640;

    useDropdowner.getState().create(
      <div className="flex flex-col">
        {appConfig.languages.map((lang) => (
          <DropdownActionItem
            key={lang}
            isMobile={isMobile}
            variant="ghost"
            className="w-full justify-between gap-4"
            onSelect={() => changeLanguage(lang)}
          >
            <span>{t(`c:${lang}`)}</span>
            <CheckIcon className={`text-success ${currentLang === lang ? 'visible' : 'invisible'}`} />
          </DropdownActionItem>
        ))}
      </div>,
      {
        id: 'user-language',
        triggerId: 'user-language-trigger',
        triggerRef,
        kind: 'menu',
      },
    );
  };

  return (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon"
      className={`data-dropdowner-active:bg-accent ${triggerClassName}`}
      aria-label="Change language"
      onClick={openDropdown}
    >
      <span className="font-normal">{language.toUpperCase()}</span>
    </Button>
  );
}
