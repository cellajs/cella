import { useNavigate } from '@tanstack/react-router';
import { CircleUserRound, LogOut, LucideProps, Settings, Wrench } from 'lucide-react';
import React from 'react';

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

  return (
    <>
      <SheetTitle>Account</SheetTitle>
      <div className="space-y-2">
        <AccountButton
          lucideButton={CircleUserRound}
          id="btn-profile"
          label="View your profile"
          accountAction={() => navigateTo(`/user/${user.slug}`)}
        />
        <AccountButton lucideButton={Settings} id="btn-account" label="Account settings" accountAction={() => navigateTo('/user/settings')} />
        {isSystemAdmin && <AccountButton lucideButton={Wrench} id="btn-system" label="System panel" accountAction={() => navigateTo('/system')} />}
        <AccountButton lucideButton={LogOut} id="btn-signout" label="Sign out" accountAction={onSignOut} />
      </div>
    </>
  );
};
