import { ChevronRight, AtSign, Search, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import InviteEmailForm from './invite-email-form';
import InviteSearchForm from './invite-search-form';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { AppAlert } from './app-alert';

interface Props {
  organization?: Organization;
  callback?: () => void;
  dialog?: boolean;
  mode?: string;
}

const InviteUsers = ({ organization, callback, dialog: isDialog, mode }: Props) => {
  const { t } = useTranslation();

  const [inviteMode, setInviteMode] = useState(mode);

  if (!inviteMode)
    return (
      <ToggleGroup type="multiple" onValueChange={(values) => setInviteMode(values[0])} className="gap-4 max-sm:flex-col">
        <ToggleGroupItem size="tile" variant="tile" value="search" aria-label="Search users">
          <Search size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <div className="font-light">{t('common:invite_by_name')}</div>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>Continue</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
        <ToggleGroupItem size="tile" variant="tile" value="email" aria-label="Add by emails">
          <AtSign size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <p className="font-light">{t('common:invite_by_email')}</p>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>Continue</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
      </ToggleGroup>
    );

  if (inviteMode === 'search')
    return (
      <>
         <AppAlert id="invite_search" Icon={Info}>
            {t('common:explain.invite_search.text')}
          </AppAlert>
        <InviteSearchForm organization={organization} callback={callback} dialog={isDialog} />
      </>
    );

  return (
    <>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
      </Alert>
      <InviteEmailForm organization={organization} callback={callback} dialog={isDialog} />{' '}
    </>
  );
};

export default InviteUsers;
