import i18n from 'i18next';
import { AtSignIcon, ChevronRightIcon, InfoIcon, SearchIcon } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { type ComponentType, type ReactNode, type RefObject, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { AnimatedArrow } from '~/modules/common/animated-arrow';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { EnrichedChannel } from '~/modules/entities/types';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { InviteBulkEmailForm } from '~/modules/user/invite-bulk-email-form';
import { InviteEmailForm } from '~/modules/user/invite-email-form';
import { InviteSearchForm } from '~/modules/user/invite-search-form';
import { type InviteFormProps, inviteDialogId } from '~/modules/user/invite-submit';
import { tw } from '~/utils/tw';

type InviteMode = 'email' | 'search' | 'bulk';

interface OpenInviteDialogOptions {
  /** Without one, a system invite. */
  channel?: EnrichedChannel;
  mode: InviteMode | null;
  description: ReactNode;
  triggerRef: TriggerRef;
  /** The element under the table bar the dialog renders into. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Opens the invite form in a dialog under a table bar, from the bar's invite button. */
export function openInviteDialog({ channel, mode, description, triggerRef, containerRef }: OpenInviteDialogOptions) {
  dialoger.getState().create(<InviteUsers channel={channel} mode={mode} dialog />, {
    id: inviteDialogId,
    triggerRef,
    drawerOnMobile: false,
    className: tw('w-auto max-w-4xl border shadow-none'),
    container: { ref: containerRef, overlay: true },
    title: i18n.t('c:invite'),
    titleContent: <UnsavedBadge title={i18n.t('c:invite')} />,
    description,
  });
}

/** Per mode: the crumb in the dialog title, the explanation above the form, and the form. */
const inviteModes: Record<InviteMode, { title: TKey; explain: TKey; Form: ComponentType<InviteFormProps> }> = {
  email: { title: 'c:email', explain: 'c:explain.invite_email.text', Form: InviteEmailForm },
  search: { title: 'c:search', explain: 'c:explain.invite_search.text', Form: InviteSearchForm },
  bulk: { title: 'c:email_bulk', explain: 'c:explain.invite_bulk.text', Form: InviteBulkEmailForm },
};

/** The modes to start from; bulk opens from the email mode's link. */
const inviteTiles = [
  { mode: 'email', icon: AtSignIcon, label: 'c:invite_by_email' },
  { mode: 'search', icon: SearchIcon, label: 'c:invite_by_name' },
] as const;

/** The dialog title's crumb renders outside this component's MotionConfig, so both read this transition. */
const modeTransition = { type: 'spring', bounce: 0, duration: 0.4 } as const;

interface InviteUsersProps extends InviteFormProps {
  mode?: InviteMode | null;
}

export function InviteUsers({ channel, dialog: isDialog, mode: initialMode, children }: InviteUsersProps) {
  const { t } = useTranslation();

  const [inviteMode, setInviteMode] = useState(initialMode);

  // The dialog's caller owns the description copy, so read it once and keep it to compose against.
  const [baseDescription] = useState(() => (isDialog ? dialoger.getState().get(inviteDialogId)?.description : undefined));

  const updateMode = (mode: InviteMode | null) => {
    setInviteMode(mode);

    dialoger.getState().update(inviteDialogId, {
      titleContent: (
        <div className="flex items-center gap-2">
          {mode ? (
            <button type="button" onClick={() => updateMode(null)}>
              {t('c:invite')}
            </button>
          ) : (
            <div>
              <UnsavedBadge title={t('c:invite')} />
            </div>
          )}
          <AnimatePresence>
            {mode && (
              <motion.span
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={modeTransition}
              >
                <ChevronRightIcon className="opacity-50" />
                <UnsavedBadge title={t(inviteModes[mode].title)} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      ),
    });
  };

  // The bulk link joins the dialog's description, where dismissing the alert below cannot hide it; onboarding has no dialog.
  useEffect(() => {
    if (!isDialog || !dialoger.getState().get(inviteDialogId)) return;

    dialoger.getState().update(inviteDialogId, {
      description:
        inviteMode === 'email' ? (
          <>
            {baseDescription}{' '}
            <Trans t={t} i18nKey="c:invite_bulk_link" components={{ bulk_anchor: <InlineLinkButton onClick={() => updateMode('bulk')} /> }} />
          </>
        ) : (
          baseDescription
        ),
    });
  }, [inviteMode, isDialog, baseDescription]);

  const current = inviteMode ? inviteModes[inviteMode] : null;

  return (
    <MotionConfig transition={modeTransition}>
      <AnimatePresence mode="popLayout">
        {!inviteMode && (
          <motion.div key="invite-initial" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <ToggleGroup
              type="multiple"
              onValueChange={(value) => updateMode((value as InviteMode[])[0] ?? null)}
              className="w-full items-stretch gap-2 py-3 max-sm:flex-col sm:h-40 sm:gap-3"
            >
              {inviteTiles.map(({ mode, icon: Icon, label }) => (
                <ToggleGroupItem key={mode} size="tile" variant="tile" value={mode} className="w-auto grow py-6 sm:py-10">
                  <Icon className="size-12" strokeWidth={1} />
                  <div className="flex flex-col truncate pl-3">
                    <p>{t(label)}</p>
                    <div className="mt-1 flex items-center truncate text-muted-foreground transition-colors group-hover/toggle:text-foreground">
                      <strong>{t('c:continue')}</strong>
                      <AnimatedArrow />
                    </div>
                  </div>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </motion.div>
        )}
        {current && (
          <motion.div key="invite-form" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-4">
            <AlertBanner id={`invite_${inviteMode}`} variant="info" icon={InfoIcon}>
              {t(current.explain)}
            </AlertBanner>
            <current.Form channel={channel} dialog={isDialog}>
              {children}
            </current.Form>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
