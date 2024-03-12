import { useNavigate } from '@tanstack/react-router';
import { CircleUserRound, LogOut, type LucideProps, UserCog, Wrench } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { getColorClass } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { SheetTitle } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

type AccountButtonProps = {
  lucideButton: React.ElementType<LucideProps>;
  label: string;
  id: string;
  accountAction: () => void;
};

// Create a button for each account action
const AccountButton: React.FC<AccountButtonProps> = ({ lucideButton: Icon, label, id, accountAction }) => {
  const btnClass = `${id === 'btn-signout' ? 'text-red-600' : ''} hover:bg-accent w-full justify-start text-left focus:outline-none focus:ring`;

  return (
    <Button onClick={accountAction} variant="ghost" size="lg" className={btnClass}>
      <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
};

export const SheetAccount = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();
  const { setSheet } = useNavigationStore();
  const isSystemAdmin = user?.role === 'ADMIN';

  const navigateTo = (path: string) => {
    navigate({ to: path });
    setSheet(null);
  };

  const onSignOut = () => {
    navigate({ to: '/sign-out' });
    setSheet(null);
  };

  const bgClass = user.bannerUrl ? 'bg-background' : getColorClass(user.id);
  const bannerClass = `relative my-4 opacity-75 group hover:opacity-100 transition-all duration-300 hover:-mx-8 -mx-4 bg-cover bg-center h-24 ${bgClass}`;

  return (
    <>
      <SheetTitle>{t('common:account')}</SheetTitle>

      <button type="button" id="account" onClick={() => navigateTo(`/user/${user.slug}`)} className="max-sm:hidden w-full">
        <div className={bannerClass} style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}>
          <div className="flex justify-center items-center bg-background/75 w-full group-hover:opacity-100 transition duration-300 h-full opacity-0">
            {t('common:view_profile')}
          </div>
        </div>
      </button>

      <div className="space-y-2 max-sm:mt-4">
        <AccountButton
          lucideButton={CircleUserRound}
          id="btn-profile"
          label={t('common:view_profile')}
          accountAction={() => navigateTo(`/user/${user.slug}`)}
        />
        <AccountButton
          lucideButton={UserCog}
          id="btn-account"
          label={t('common:account_settings')}
          accountAction={() => navigateTo('/user/settings')}
        />
        {isSystemAdmin && (
          <AccountButton lucideButton={Wrench} id="btn-system" label={t('common:system_panel')} accountAction={() => navigateTo('/system')} />
        )}
        <AccountButton lucideButton={LogOut} id="btn-signout" label={t('common:sign_out')} accountAction={onSignOut} />
      </div>
    </>
  );
};
