import { AtSign, ChevronRight, Info, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useFocusById from '~/hooks/use-focus-by-id';
import { AppAlert } from '~/modules/common/app-alert';
import { dialog } from '~/modules/common/dialoger/state';
import { DialogTitle } from '../ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import InviteEmailForm from './invite-email-form';
import InviteSearchForm from './invite-search-form';

interface InviteUsersProps {
  organizationIdOrSlug?: string;
  type?: 'system' | 'organization';
  callback?: () => void;
  dialog?: boolean;
  mode?: string | null;
  children?: React.ReactNode;
}

const InviteUsers = ({ organizationIdOrSlug, type = 'system', callback, dialog: isDialog, mode, children }: InviteUsersProps) => {
  const { t } = useTranslation();

  const [inviteMode, setInviteMode] = useState(mode);
  if (!mode) useFocusById('create-project-option');

  const updateMode = (mode: string[]) => {
    mode[0] ? setInviteMode(mode[0]) : setInviteMode(null);

    dialog.update('user-invite', {
      title: mode[0] ? (
        <DialogTitle className="flex items-center gap-2">
          <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
            {t('common:invite')}
          </button>
          <ChevronRight className="opacity-50" size={16} />
          <span>{mode[0] === 'search' ? t('common:search') : t('common:email')}</span>
        </DialogTitle>
      ) : (
        <DialogTitle>{t('common:invite')}</DialogTitle>
      ),
    });
  };

  if (!inviteMode) {
    return (
      <ToggleGroup type="multiple" onValueChange={updateMode} className="gap-4 max-sm:flex-col">
        <ToggleGroupItem size="tile" variant="tile" value="search" aria-label="Search users">
          <Search size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <div className="font-light">{t('common:invite_by_name')}</div>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>{t('common:continue')}</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
        <ToggleGroupItem size="tile" variant="tile" value="email" aria-label="Add by emails">
          <AtSign size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <p className="font-light">{t('common:invite_by_email')}</p>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>{t('common:continue')}</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
      </ToggleGroup>
    );
  }

  if (inviteMode === 'search') {
    return (
      <div className="flex flex-col gap-4">
        <AppAlert id="invite_search" variant="success" Icon={Info}>
          {t('common:explain.invite_search.text')}
        </AppAlert>
        <InviteSearchForm organizationIdOrSlug={organizationIdOrSlug} type={type} callback={callback} dialog={isDialog} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AppAlert id="invite_email" variant="success" Icon={Info}>
        {t('common:explain.invite_email.text')}
      </AppAlert>
      <InviteEmailForm organizationIdOrSlug={organizationIdOrSlug} type={type} callback={callback} dialog={isDialog}>
        {children}
      </InviteEmailForm>
    </div>
  );
};

export default InviteUsers;
