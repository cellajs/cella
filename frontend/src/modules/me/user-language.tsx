import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { CheckIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { updateMe } from '~/api.gen';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

interface Props {
  triggerClassName?: string;
}

export function UserLanguage({ triggerClassName = '' }: Props) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { user, updateUser } = useUserStore();
  const language = user?.language || i18n.languages[0];

  const changeLanguage = (lng: Language) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');
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

    useDropdowner.getState().create(
      <div className="flex flex-col">
        {appConfig.languages.map((lang) => (
          <Button
            key={lang}
            variant="ghost"
            className="w-full justify-between gap-4"
            onClick={() => changeLanguage(lang)}
          >
            <span>{t(`common:${lang}`)}</span>
            <CheckIcon size={16} className={`text-success ${currentLang === lang ? 'visible' : 'invisible'}`} />
          </Button>
        ))}
      </div>,
      {
        id: 'user-language',
        triggerId: 'user-language-trigger',
        triggerRef,
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
