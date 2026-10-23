import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type Language } from 'shared';
import { DropdownSelectItem } from '~/modules/common/dropdowner/dropdown-select-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { useUpdateSelfMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

export function UserLanguage() {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const user = useUserStore((state) => state.user);
  const language = user?.language || i18n.languages[0];
  const { mutate: updateSelf } = useUpdateSelfMutation();

  const changeLanguage = (lng: Language) => {
    if (!onlineManager.isOnline()) return toastOffline();
    if (window.Gleap) window.Gleap.setLanguage(lng);
    i18n.changeLanguage(lng);
    dropdowner.getState().remove();

    if (user) updateSelf({ language: lng });
  };

  if (appConfig.languages.length < 2) return null;

  const openDropdown = () => {
    dropdowner.getState().create(
      <div className="flex flex-col">
        {appConfig.languages.map((lang) => (
          <DropdownSelectItem key={lang} selected={language === lang} onSelect={() => changeLanguage(lang)}>
            <span lang={lang}>{t(`c:${lang}`)}</span>
          </DropdownSelectItem>
        ))}
      </div>,
      { id: 'user-language', triggerId: 'user-language-trigger', triggerRef, kind: 'menu' },
    );
  };

  return (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="icon"
      className="data-dropdowner-active:bg-foreground/8"
      aria-label={`${language.toUpperCase()}, ${t('c:change_language')}`}
      onClick={openDropdown}
    >
      <span className="font-normal">{language.toUpperCase()}</span>
    </Button>
  );
}
