import { AtSign, ChevronRight, Info, Search } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { AnimatedArrow } from '~/modules/common/animated-arrow';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import type { EntityPage } from '~/modules/entities/types';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import InviteEmailForm from '~/modules/users/invite-email-form';
import InviteSearchForm from '~/modules/users/invite-search-form';

interface InviteUsersProps {
  entity?: EntityPage;
  dialog?: boolean;
  mode?: 'search' | 'email' | null;
  children?: React.ReactNode;
}

// When no entity type, it's a system invite
const InviteUsers = ({ entity, dialog: isDialog, mode: baseMode, children }: InviteUsersProps) => {
  const { t } = useTranslation();

  const [inviteMode, setInviteMode] = useState(baseMode);

  const updateMode = (mode: ('search' | 'email')[]) => {
    // If mode is empty, go back to initial state
    mode[0] ? setInviteMode(mode[0]) : setInviteMode(null);

    // Update dialog title
    useDialoger.getState().update('invite-users', {
      titleContent: (
        <div className="flex items-center gap-2">
          {mode[0] ? (
            <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
              {t('common:invite')}
            </button>
          ) : (
            <div>
              <UnsavedBadge title={t('common:invite')} />
            </div>
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
                <UnsavedBadge title={mode[0] === 'search' ? t('common:search') : t('common:email')} />
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
        {!inviteMode && (
          <motion.div key="invite-initial" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <ToggleGroup type="multiple" onValueChange={updateMode} className="max-sm:flex-col sm:gap-3">
              <ToggleGroupItem size="tile" variant="tile" value="email" aria-label="Add by email" className="h-auto py-6 sm:py-10">
                <AtSign size={48} strokeWidth={1} />
                <div className="flex flex-col pl-3">
                  <p>{t('common:invite_by_email')}</p>
                  <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('common:continue')}</strong>
                    <AnimatedArrow />
                  </div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem size="tile" variant="tile" value="search" aria-label="Search users" className="h-auto py-6 sm:py-10">
                <Search size={48} strokeWidth={1} />
                <div className="flex flex-col pl-3">
                  <div>{t('common:invite_by_name')}</div>
                  <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('common:continue')}</strong>
                    <AnimatedArrow />
                  </div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </motion.div>
        )}
        {inviteMode && (
          <motion.div key="invite-form" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-4">
            <AlertWrap id={`invite_${inviteMode}`} variant="success" icon={Info}>
              {t(inviteMode === 'email' ? 'common:explain.invite_email.text' : 'common:explain.invite_search.text')}
            </AlertWrap>
            {inviteMode === 'email' ? (
              <InviteEmailForm entity={entity} dialog={isDialog}>
                {children}
              </InviteEmailForm>
            ) : (
              <InviteSearchForm entity={entity} dialog={isDialog} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
};

export default InviteUsers;
