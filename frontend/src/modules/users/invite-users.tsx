import { AtSign, ChevronRight, Info, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useFocusById from '~/hooks/use-focus-by-id';
import { AppAlert } from '~/modules/common/app-alert';
import { dialog } from '~/modules/common/dialoger/state';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import InviteEmailForm from './invite-email-form';
import InviteSearchForm from './invite-search-form';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';

interface InviteUsersProps {
  organizationIdOrSlug?: string | null;
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
      title: (
        <div className="flex items-center gap-2">
          {mode[0] ? (
            <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
              {t('common:invite')}
            </button>
          ) : (
            <div>{t('common:invite')}</div>
          )}
          <AnimatePresence>
            {mode[0] && (
              <motion.span
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              >
                <ChevronRight className="opacity-50" size={16} />
                {mode[0] === 'search' ? t('common:search') : t('common:email')}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      ),
    });
  };

  return (
    <MotionConfig transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>
      <AnimatePresence mode="popLayout">
        {!inviteMode ? (
          <motion.div key="initial" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
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
          </motion.div>
        ) : inviteMode === 'search' ? (
          <motion.div
            key="search"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <AppAlert id="invite_search" variant="success" Icon={Info}>
              {t('common:explain.invite_search.text')}
            </AppAlert>
            <InviteSearchForm organizationIdOrSlug={organizationIdOrSlug} type={type} callback={callback} dialog={isDialog} />
          </motion.div>
        ) : (
          inviteMode === 'email' && (
            <motion.div
              key="search"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -40, opacity: 0 }}
              className="flex flex-col gap-4"
            >
              <AppAlert id="invite_email" variant="success" Icon={Info}>
                {t('common:explain.invite_email.text')}
              </AppAlert>
              <InviteEmailForm organizationIdOrSlug={organizationIdOrSlug} type={type} callback={callback} dialog={isDialog}>
                {children}
              </InviteEmailForm>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};

export default InviteUsers;
