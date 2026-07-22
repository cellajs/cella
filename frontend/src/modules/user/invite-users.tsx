import { zodResolver } from '@hookform/resolvers/zod';
import { AtSignIcon, ChevronRightIcon, InfoIcon, SearchIcon } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { type ChannelEntityType, hierarchy } from 'shared';
import type z from 'zod';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { AnimatedArrow } from '~/modules/common/animated-arrow';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { EnrichedChannel } from '~/modules/entities/types';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { InviteBulkEmailForm } from '~/modules/user/invite-bulk-email-form';
import { InviteEmailForm } from '~/modules/user/invite-email-form';
import { InviteSearchForm } from '~/modules/user/invite-search-form';

const InviteFormSchema = zMembershipInviteBody;
export type InviteFormValues = z.infer<typeof InviteFormSchema>;

/** Default invite role for a context: 'member' when the vocabulary has it, else the least-privileged role. */
const defaultInviteRole = (entityType?: ChannelEntityType): InviteFormValues['role'] => {
  const channelRoles = entityType ? hierarchy.getRoles(entityType) : [];
  if (!channelRoles.length || channelRoles.includes('member')) return 'member';
  return channelRoles[channelRoles.length - 1] as InviteFormValues['role'];
};

/**
 * Creates a draft-backed invite form for the given entity.
 */
export function useInviteFormDraft(entityId?: string, entityType?: ChannelEntityType) {
  return useFormWithDraft<InviteFormValues>(`invite-users${entityId ? `-${entityId}` : ''}`, {
    formContainerId: 'invite-users',
    formOptions: {
      resolver: zodResolver(InviteFormSchema),
      defaultValues: { emails: [], role: defaultInviteRole(entityType) },
    },
  });
}

interface InviteUsersProps {
  channel?: EnrichedChannel;
  dialog?: boolean;
  mode?: 'search' | 'email' | 'bulk' | null;
  children?: React.ReactNode;
}

// When no entity type, it's a system invite
export function InviteUsers({ channel, dialog: isDialog, mode: baseMode, children }: InviteUsersProps) {
  const { t } = useTranslation();

  const [inviteMode, setInviteMode] = useState(baseMode);

  const updateMode = (mode: ('search' | 'email' | 'bulk')[]) => {
    // If mode is empty, go back to initial state
    mode[0] ? setInviteMode(mode[0]) : setInviteMode(null);

    // Update dialog title
    useDialoger.getState().update('invite-users', {
      titleContent: (
        <div className="flex items-center gap-2">
          {mode[0] ? (
            <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
              {t('c:invite')}
            </button>
          ) : (
            <div>
              <UnsavedBadge title={t('c:invite')} />
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
                <ChevronRightIcon className="opacity-50" />
                <UnsavedBadge
                  title={mode[0] === 'search' ? t('c:search') : mode[0] === 'bulk' ? t('app:email_bulk') : t('c:email')}
                />
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
            <ToggleGroup
              type="multiple"
              onValueChange={(v) => updateMode(v as ('search' | 'email')[])}
              className="w-full items-stretch gap-2 py-3 max-sm:flex-col sm:h-40 sm:gap-3"
            >
              <ToggleGroupItem
                size="tile"
                variant="tile"
                value="email"
                aria-label="Add by email"
                className="w-auto grow py-6 sm:py-10"
              >
                <AtSignIcon className="size-12" strokeWidth={1} />
                <div className="flex flex-col truncate pl-3">
                  <p>{t('c:invite_by_email')}</p>
                  <div className="mt-1 flex flex-row items-center truncate opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('c:continue')}</strong>
                    <AnimatedArrow />
                  </div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem
                size="tile"
                variant="tile"
                value="search"
                aria-label="Search users"
                className="w-auto grow py-6 sm:py-10"
              >
                <SearchIcon className="size-12" strokeWidth={1} />
                <div className="flex flex-col truncate pl-3">
                  <div>{t('c:invite_by_name')}</div>
                  <div className="mt-1 flex flex-row items-center truncate opacity-50 transition-opacity group-hover:opacity-100">
                    <strong>{t('c:continue')}</strong>
                    <AnimatedArrow />
                  </div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </motion.div>
        )}
        {inviteMode && (
          <motion.div
            key="invite-form"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col gap-4"
          >
            <AlertBanner id={`invite_${inviteMode}`} variant="success" icon={InfoIcon}>
              {t(
                inviteMode === 'search'
                  ? 'c:explain.invite_search.text'
                  : inviteMode === 'bulk'
                    ? 'app:explain.invite_bulk.text'
                    : 'c:explain.invite_email.text',
              )}
              {inviteMode === 'email' && (
                <button type="button" className="ml-1 underline" onClick={() => updateMode(['bulk'])}>
                  {t('app:invite_bulk_link')}
                </button>
              )}
            </AlertBanner>
            {inviteMode === 'email' ? (
              <InviteEmailForm channel={channel} dialog={isDialog}>
                {children}
              </InviteEmailForm>
            ) : inviteMode === 'bulk' ? (
              <InviteBulkEmailForm channel={channel} dialog={isDialog}>
                {children}
              </InviteBulkEmailForm>
            ) : (
              <InviteSearchForm channel={channel} dialog={isDialog} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
