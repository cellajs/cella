import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { ClipboardPasteIcon, MailIcon, UsersRoundIcon } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { type ComponentType, type ReactNode, type RefObject, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { hierarchy, isUnpublishedDraft } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import type { IconComponent } from '~/modules/common/icons/types';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { EnrichedChannel } from '~/modules/entities/types';
import { openPendingMembershipsSheet } from '~/modules/memberships/pending-memberships-count';
import { Button } from '~/modules/ui/button';
import { Form } from '~/modules/ui/field';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';
import { InviteBulkField } from '~/modules/user/invite-bulk-field';
import { InviteEmailField } from '~/modules/user/invite-email-field';
import { focusOnMount, InviteResult, type InviteResultData } from '~/modules/user/invite-result';
import { InviteSearchField } from '~/modules/user/invite-search-field';
import { type InviteFieldProps, InviteFormFooter, inviteDialogId, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
import { useInviteCheck } from '~/modules/user/use-invite-check';
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

/** Per mode: its name, the line under it on the chooser, its icon and its field. */
const inviteModes: Record<InviteMode, { label: TKey; text: TKey; icon: IconComponent; Field: ComponentType<InviteFieldProps> }> = {
  email: { label: 'c:invite_mode_email', text: 'c:invite_mode_email.text', icon: MailIcon, Field: InviteEmailField },
  search: { label: 'c:invite_mode_search', text: 'c:invite_mode_search.text', icon: UsersRoundIcon, Field: InviteSearchField },
  bulk: { label: 'c:invite_mode_bulk', text: 'c:invite_mode_bulk.text', icon: ClipboardPasteIcon, Field: InviteBulkField },
};

const modeTransition = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const modeEntrance = { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 } };

interface InviteUsersProps {
  /** Without one the form sends a system invite. */
  channel?: EnrichedChannel;
  /** Rendered in the `invite-users` dialog, which a sent invite closes. */
  dialog?: boolean;
  mode?: InviteMode | null;
  /** Takes the place of the cancel button, as the onboarding footer does. */
  children?: ReactNode;
}

/** The invite form. The mode only swaps its field, so the form, its draft and a running send outlive a switch. */
export function InviteUsers({ channel, dialog, mode: initialMode, children }: InviteUsersProps) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const [inviteMode, setInviteMode] = useState(initialMode);
  const [result, setResult] = useState<InviteResultData | null>(null);
  // A new key starts a field over, with the text typed into it.
  const [fieldKey, setFieldKey] = useState(0);

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const emails = useWatch({ control: form.control, name: 'emails' }) ?? [];
  const unparsed = useWatch({ control: form.control, name: 'unparsed' }) ?? [];
  const role = useWatch({ control: form.control, name: 'role' });

  const held = !!channel && isUnpublishedDraft(channel) && !hierarchy.getPrepareRoles(channel.entityType).includes(role);
  const check = useInviteCheck(channel, emails, unparsed, held);

  const reset = () => {
    form.reset();
    setFieldKey((key) => key + 1);
  };

  const close = () => {
    if (dialog) dialoger.getState().remove(inviteDialogId);
    nextStep();
  };

  const { onSubmit, isPending } = useInviteSubmit({ channel, onSent: reset, onResult: setResult, onClose: close });

  if (result) {
    const openPending = () => {
      const triggerRef = dialoger.getState().get(inviteDialogId)?.triggerRef;
      if (!channel || !triggerRef) return;
      if (!onlineManager.isOnline()) return toastOffline();
      close();
      openPendingMembershipsSheet(channel, triggerRef);
    };

    return (
      <InviteResult result={result} onDone={close} onOpenPending={channel && dialog ? openPending : undefined} onInviteMore={() => setResult(null)} />
    );
  }

  // Searching people needs a channel to check them against.
  const modes: InviteMode[] = channel ? ['email', 'search', 'bulk'] : ['email', 'bulk'];
  const Field = inviteMode ? inviteModes[inviteMode].Field : null;

  return (
    <MotionConfig transition={modeTransition}>
      {inviteMode && Field ? (
        // Coming from the chooser, whose pressed tile is gone, focus starts here and not on the page
        <motion.div
          key="invite-form"
          ref={initialMode ? undefined : focusOnMount}
          tabIndex={-1}
          {...modeEntrance}
          className="flex flex-col gap-4 outline-hidden"
        >
          <SegmentedControl<InviteMode>
            aria-label={t('c:invite_mode')}
            value={inviteMode}
            onValueChange={setInviteMode}
            disabled={isPending}
            size="sm"
          >
            {modes.map((mode) => (
              <SegmentedControlItem key={mode} value={mode}>
                {t(inviteModes[mode].label)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <Field key={fieldKey} {...{ form, channel, check, emails, unparsed }} />
              <InviteFormFooter {...{ form, channel, check, held }} isEmpty={!emails.length && !unparsed.length} loading={isPending} onCancel={reset}>
                {children}
              </InviteFormFooter>
            </form>
          </Form>
        </motion.div>
      ) : (
        <motion.div key="invite-initial" {...modeEntrance}>
          <div className="grid w-full gap-2 py-3 sm:grid-cols-3 sm:gap-3">
            {modes.map((mode) => {
              const { label, text, icon: Icon } = inviteModes[mode];
              return (
                <Button
                  key={mode}
                  variant="outline"
                  size="auto"
                  className="h-auto flex-col items-start justify-start gap-2.5 whitespace-normal rounded-xl p-4 text-left"
                  onClick={() => setInviteMode(mode)}
                >
                  <Icon className="size-10" strokeWidth={1.25} />
                  <span>{t(label)}</span>
                  <span className="font-normal text-muted-foreground">{t(text)}</span>
                </Button>
              );
            })}
          </div>
        </motion.div>
      )}
    </MotionConfig>
  );
}
