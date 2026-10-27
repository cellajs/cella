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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const user = useUserStore((state) => state.user);
  const currentLanguage = user?.language || i18n.languages[0];
  const { mutate: updateSelf } = useUpdateSelfMutation();

  const changeLanguage = (language: Language) => {
    if (!onlineManager.isOnline()) return toastOffline();
    if (window.Gleap) window.Gleap.setLanguage(language);
    i18n.changeLanguage(language);
    dropdowner.getState().remove();

    if (user) updateSelf({ language });
  };

  if (appConfig.languages.length < 2) return null;

  const openDropdown = () => {
    dropdowner.getState().create(
      <div className="flex flex-col">
        {appConfig.languages.map((language) => (
          <DropdownSelectItem key={language} selected={currentLanguage === language} onSelect={() => changeLanguage(language)}>
            <span lang={language}>{t(`c:${language}`)}</span>
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
      className="data-dropdowner-active:bg-muted"
      aria-label={`${currentLanguage.toUpperCase()}, ${t('c:change_language')}`}
      onClick={openDropdown}
    >
      <span className="font-normal">{currentLanguage.toUpperCase()}</span>
    </Button>
  );
}
