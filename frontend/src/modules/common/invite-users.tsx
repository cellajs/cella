import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { ChevronRight, Mail, Search } from 'lucide-react';
import InviteSearchForm from './invite-search-form';
import InviteEmailForm from './invite-email-form';
import { useState } from 'react';

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
          <Mail size={48} strokeWidth={1} />
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

    if (inviteMode === 'search') return <InviteSearchForm organization={organization} callback={callback} dialog={isDialog} />;
    
    return <InviteEmailForm organization={organization} callback={callback} dialog={isDialog} />;
};

export default InviteUsers;
