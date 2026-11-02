import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { ChevronRightIcon, ClipboardPasteIcon, MailIcon, UsersRoundIcon } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { type ComponentType, type FormEvent, type ReactNode, type RefObject, useRef, useState } from 'react';
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
import { InviteBulkField } from '~/modules/user/invite-bulk-field';
import { InviteEmailField } from '~/modules/user/invite-email-field';
import { InviteGroups } from '~/modules/user/invite-groups';
import { focusOnMount, InviteResult, type InviteResultData } from '~/modules/user/invite-result';
import { InviteSearchField } from '~/modules/user/invite-search-field';
import { type InviteFieldProps, InviteFormFooter, inviteDialogId, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
import { useInviteCheck } from '~/modules/user/use-invite-check';
import { useInviteList } from '~/modules/user/use-invite-list';
import { tw } from '~/utils/tw';

type InviteMode = 'email' | 'search' | 'bulk';

interface OpenInviteDialogOptions {
  /** Without one, a system invite. */
  channel?: EnrichedChannel;
  description: ReactNode;
  triggerRef: TriggerRef;
  /** The element under the table bar the dialog renders into. */
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Opens the invite form in a dialog under a table bar, from the bar's invite button. */
export function openInviteDialog({ channel, description, triggerRef, containerRef }: OpenInviteDialogOptions) {
  dialoger.getState().create(<InviteUsers channel={channel} dialog />, {
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

/** Per mode: its name on the chooser and in the dialog title, the line under it on the chooser, its icon and its field. */
const inviteModes: Record<InviteMode, { label: TKey; crumb: TKey; text: TKey; icon: IconComponent; Field: ComponentType<InviteFieldProps> }> = {
  email: { label: 'c:invite_mode_email', crumb: 'c:invite_mode_email', text: 'c:invite_mode_email.text', icon: MailIcon, Field: InviteEmailField },
  search: {
    label: 'c:invite_mode_search',
    crumb: 'c:invite_mode_search',
    text: 'c:invite_mode_search.text',
    icon: UsersRoundIcon,
    Field: InviteSearchField,
  },
  bulk: { label: 'c:invite_mode_bulk', crumb: 'c:paste', text: 'c:invite_mode_bulk.text', icon: ClipboardPasteIcon, Field: InviteBulkField },
};

const modeTransition = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const modeEntrance = { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 } };

interface InviteUsersProps {
  /** Without one the form sends a system invite. */
  channel?: EnrichedChannel;
  /** Rendered in the `invite-users` dialog, which a sent invite closes. */
  dialog?: boolean;
  /** Skips the chooser. Without the dialog's title there is no way back to it. */
  mode?: InviteMode;
  /** Takes the place of the cancel button, as the onboarding footer does. */
  children?: ReactNode;
}

/** The invite form. The mode only swaps its field, so the form, its draft and a running send outlive a switch. */
export function InviteUsers({ channel, dialog, mode: initialMode, children }: InviteUsersProps) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  const formRef = useRef<HTMLFormElement>(null);

  const [inviteMode, setInviteMode] = useState<InviteMode | null>(initialMode ?? null);
  const [result, setResult] = useState<InviteResultData | null>(null);

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const list = useInviteList(form);
  const role = useWatch({ control: form.control, name: 'role' });

  const held = !!channel && isUnpublishedDraft(channel) && !hierarchy.getPrepareRoles(channel.entityType).includes(role);
  const check = useInviteCheck(channel, list.emails, list.unparsed, held);

  const close = () => {
    if (dialog) dialoger.getState().remove(inviteDialogId);
    nextStep();
  };

  const { onSubmit, isPending } = useInviteSubmit({ channel, onSent: list.reset, onResult: setResult, onClose: close });

  // The crumb names where the form is and goes back to the chooser. The list stays, and so does a paste nobody checked yet.
  const chooseMode = (mode: InviteMode | null) => {
    list.leaveField();
    list.setPasteOpen(mode === 'bulk');
    setResult(null);
    setInviteMode(mode);
    if (!dialog) return;
    dialoger.getState().update(inviteDialogId, {
      titleContent: mode ? (
        <span className="flex items-center gap-2">
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => chooseMode(null)}>
            {t('c:invite')}
          </button>
          <ChevronRightIcon className="size-4 text-faint-foreground" />
          <UnsavedBadge title={t(inviteModes[mode].crumb)} />
        </span>
      ) : (
        <UnsavedBadge title={t('c:invite')} />
      ),
    });
  };

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
  const boxOpen = inviteMode === 'bulk' && (list.pasteOpen || !list.hasList);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (list.commitTyped()) form.handleSubmit(onSubmit)(event);
  };

  const cancel = () => {
    list.reset();
    formRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  };

  return (
    <MotionConfig transition={modeTransition}>
      <Form {...form}>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
          {inviteMode && Field ? (
            <motion.div key="invite-field" {...modeEntrance}>
              <Field channel={channel} check={check} list={list} autoFocus={!initialMode} onToEmail={() => chooseMode('email')} />
            </motion.div>
          ) : (
            // What held focus is gone: the pressed crumb, or the trigger behind the dialog on arrival
            <motion.div key="invite-initial" ref={focusOnMount} tabIndex={-1} {...modeEntrance} className="outline-hidden">
              <div className="grid w-full gap-2 py-3 sm:grid-cols-3 sm:gap-3">
                {modes.map((mode) => {
                  const { label, text, icon: Icon } = inviteModes[mode];
                  return (
                    <Button
                      key={mode}
                      type="button"
                      variant="outline"
                      size="auto"
                      className="h-auto flex-col items-start justify-start gap-2.5 whitespace-normal rounded-xl p-4 text-left"
                      onClick={() => chooseMode(mode)}
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
          {list.hasList && <InviteGroups check={check} list={list} held={held} />}
          {(inviteMode ? !boxOpen : list.hasList) && (
            <InviteFormFooter form={form} channel={channel} check={check} list={list} held={held} loading={isPending} onCancel={cancel}>
              {children}
            </InviteFormFooter>
          )}
        </form>
      </Form>
    </MotionConfig>
  );
}
