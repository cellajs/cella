import { Link } from '@tanstack/react-router';
import { CircleUserRound, LogOut, type LucideProps, UserCog, Wrench } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { getColorClass } from '~/lib/utils';
import { cn } from '~/lib/utils';
import { buttonVariants } from '~/modules/ui/button';
import { SheetTitle } from '~/modules/ui/sheet';
import { useUserStore } from '~/store/user';
import { AppFooter } from '../app-footer';
import { AvatarWrap } from '../avatar-wrap';

type AccountButtonProps = {
  lucide: React.ElementType<LucideProps>;
  label: string;
  id: string;
  action: string;
};

// Create a button for each account action
const AccountButton: React.FC<AccountButtonProps> = ({ lucide: Icon, label, id, action }) => {
  const btnClass = `${id === 'btn-signout' && 'text-red-600'} hover:bg-accent/50 w-full justify-start text-left`;

  return (
    <Link to={action} className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), btnClass)}>
      <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
};

export const SheetAccount = () => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const isSystemAdmin = user.role === 'admin';

  const bgClass = user.bannerUrl ? 'bg-background' : getColorClass(user.id);
  const bannerClass = `relative group transition-all duration-300 hover:-mx-8 -mx-4 bg-cover bg-center h-24 ${bgClass}`;

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-3rem)]">
      <SheetTitle>{t('common:account')}</SheetTitle>

      <Link id="account" to="/user/$idOrSlug" params={{ idOrSlug: user.slug }} className="w-full relative">
        <div className={bannerClass} style={user.bannerUrl ? { backgroundImage: `url(${user.bannerUrl})` } : {}}>
          <div className="absolute z-10 flex justify-center items-center bg-background/50 w-full group-hover:opacity-100 transition duration-300 h-full opacity-0">
            {t('common:view_profile')}
          </div>
        </div>
        <AvatarWrap
          className="h-16 w-16 absolute top-4 text-2xl transition duration-300 ml-4 border-bg border-2 rounded-full"
          type="user"
          id={user.id}
          name={user.name}
          url={user.thumbnailUrl}
        />
      </Link>

      <div className="flex flex-col gap-1 max-sm:mt-4">
        <AccountButton lucide={CircleUserRound} id="btn-profile" label={t('common:view_profile')} action={`/user/${user.slug}`} />
        <AccountButton lucide={UserCog} id="btn-account" label={t('common:account')} action="/user/settings" />
        {isSystemAdmin && <AccountButton lucide={Wrench} id="btn-system" label={t('common:system_panel')} action="/system/users" />}
        <AccountButton lucide={LogOut} id="btn-signout" label={t('common:sign_out')} action="/sign-out" />
      </div>

      <div className="grow" />

      <AppFooter className="scale-90" />
    </div>
  );
};
