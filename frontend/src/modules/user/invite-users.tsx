import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { ChevronRightIcon, ClipboardPasteIcon, ClockIcon, MailIcon, SendIcon, UsersRoundIcon } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { type ComponentType, type FormEvent, Fragment, type ReactNode, type RefObject, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, hierarchy, isUnpublishedDraft } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { CancelButton } from '~/modules/common/form-fields/cancel-button';
import { FormActions } from '~/modules/common/form-fields/form-actions';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import type { IconComponent } from '~/modules/common/icons/types';
import { NamedText } from '~/modules/common/named-text';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { EnrichedChannel } from '~/modules/entities/types';
import { openPendingMembershipsSheet } from '~/modules/memberships/pending-memberships-count';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { Form, FormField, FormItem, FormLabel } from '~/modules/ui/field';
import { InviteBulkField, InviteEmailField, InviteSearchField } from '~/modules/user/invite-fields';
import { InviteGroups } from '~/modules/user/invite-groups';
import { focusOnMount, InviteResult, type InviteResultData } from '~/modules/user/invite-result';
import { type InviteFieldProps, type InviteForm, inviteDialogId, useInviteFormDraft, useInviteSubmit } from '~/modules/user/invite-submit';
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
  dialoger.getState().create(<InviteUsers channel={channel} dialog description={description} />, {
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

/** Per mode: its name on the chooser, its crumb in the dialog title, the situation it suits under its name, its icon and its field. */
const inviteModes: Record<InviteMode, { label: TKey; crumb: TKey; text: TKey; icon: IconComponent; Field: ComponentType<InviteFieldProps> }> = {
  email: { label: 'c:invite_mode_email', crumb: 'c:email', text: 'c:invite_mode_email.text', icon: MailIcon, Field: InviteEmailField },
  search: { label: 'c:invite_mode_search', crumb: 'c:people', text: 'c:invite_mode_search.text', icon: UsersRoundIcon, Field: InviteSearchField },
  bulk: { label: 'c:invite_mode_bulk', crumb: 'c:paste', text: 'c:invite_mode_bulk.text', icon: ClipboardPasteIcon, Field: InviteBulkField },
};

const modeTransition = { type: 'spring', bounce: 0, duration: 0.4 } as const;
const modeEntrance = { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 } };

interface SubmitLabelOptions {
  invite: number;
  remind: number;
  isEmpty: boolean;
  held: boolean;
}

const submitLabel = ({ invite, remind, isEmpty, held }: SubmitLabelOptions): TKey => {
  if (!invite && !remind) return isEmpty ? 'c:invite' : 'c:nothing_to_send';
  if (held) return 'c:save';
  if (invite && remind) return 'c:invite_and_remind';
  return remind ? 'c:remind' : 'c:invite';
};

/** What every role of the channel may do, as the role field's help. */
function RoleHelp({ entityType }: { entityType: ChannelEntityType }) {
  const { t } = useTranslation();

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-1">
      {hierarchy.getRoles(entityType).map((role) => (
        <Fragment key={role}>
          <dt className="font-medium">{t(`c:${role}`)}</dt>
          <dd>{t(`c:role_description.${role}`)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

interface InviteRoleFieldProps {
  form: InviteForm;
  channel: EnrichedChannel;
  /** The picked role's email waits for its draft channel's publish. */
  held: boolean;
}

/** Role choice for a channel invite, with when its email goes out in a draft channel. */
function InviteRoleField({ form, channel, held }: InviteRoleFieldProps) {
  const { t } = useTranslation();

  return (
    <FormField
      control={form.control}
      name="role"
      render={({ field: { value, onChange } }) => (
        <FormItem>
          <FormLabel nativeLabel={false} help={<RoleHelp entityType={channel.entityType} />}>
            {t('c:join_as')}
          </FormLabel>
          <SelectRoleRadio value={value} onChange={onChange} entityType={channel.entityType} />
          {isUnpublishedDraft(channel) && (
            <Alert variant="info">
              <ClockIcon />
              <AlertDescription>
                <NamedText
                  i18nKey={held ? 'c:invite_held.text' : 'c:invite_prepare.text'}
                  name={channel.name}
                  values={{ roles: t(`c:${value}`, { count: 2 }) }}
                />
              </AlertDescription>
            </Alert>
          )}
        </FormItem>
      )}
    />
  );
}

interface InviteUsersProps {
  channel?: EnrichedChannel;
  /** Rendered in the `invite-users` dialog, which a sent invite closes. */
  dialog?: boolean;
  /** The dialog's line under its title, shown with the chooser only. */
  description?: ReactNode;
  /** Skips the chooser. Without the dialog's title there is no way back to it. */
  mode?: InviteMode;
  /** Takes the place of the cancel button. */
  children?: ReactNode;
}

/** The invite form. The mode only swaps its field, so the form, its draft and a running send outlive a switch. */
export function InviteUsers({ channel, dialog, description, mode: initialMode, children }: InviteUsersProps) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();
  const formRef = useRef<HTMLFormElement>(null);

  const [inviteMode, setInviteMode] = useState<InviteMode | null>(initialMode ?? null);
  const [result, setResult] = useState<InviteResultData | null>(null);

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const list = useInviteList(form);
  const role = useWatch({ control: form.control, name: 'role' });

  const held = !!channel && isUnpublishedDraft(channel) && !hierarchy.getPrepareRoles(channel.entityType).includes(role);
  const check = useInviteCheck(channel, list.emails, list.unparsed, held, list.people);

  const close = () => {
    if (dialog) dialoger.getState().remove(inviteDialogId);
    nextStep();
  };

  const { onSubmit, isPending } = useInviteSubmit({ channel, onSent: list.reset, onResult: setResult, onClose: close });

  // The crumb names where the form is and goes back to the chooser. The list stays.
  const chooseMode = (mode: InviteMode | null) => {
    list.leaveField();
    setResult(null);
    setInviteMode(mode);
    if (!dialog) return;
    dialoger.getState().update(inviteDialogId, {
      description: mode ? undefined : description,
      titleContent: mode ? (
        <span className="flex items-center gap-2">
          <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => chooseMode(null)}>
            {t('c:invite')}
          </button>
          <ChevronRightIcon className="text-faint-foreground size-4" />
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (list.commitTyped() && list.commitPasted()) form.handleSubmit(onSubmit)(event);
  };

  const cancel = () => {
    list.reset();
    formRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  };

  // An address the check could not answer for still goes: the send decides, and its result says what happened.
  const invite = check.groups.new.length + check.groups.unchecked.length + (list.typedAddress ? 1 : 0);
  const remind = check.groups.again.length;
  const isEmpty = !list.hasList && !list.typed.trim();

  return (
    <MotionConfig transition={modeTransition} reducedMotion="user">
      <Form {...form}>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-6">
          {inviteMode && Field ? (
            <motion.div key="invite-field" {...modeEntrance}>
              <Field channel={channel} check={check} list={list} autoFocus={!initialMode} onToEmail={() => chooseMode('email')} />
            </motion.div>
          ) : (
            // What held focus is gone: the pressed crumb, or the trigger behind the dialog on arrival
            <motion.div key="invite-initial" ref={focusOnMount} tabIndex={-1} {...modeEntrance} className="outline-hidden">
              <div className="grid w-full gap-2 py-3 sm:auto-cols-fr sm:grid-flow-col sm:gap-3">
                {modes.map((mode) => {
                  const { label, text, icon: Icon } = inviteModes[mode];
                  return (
                    <Button
                      key={mode}
                      type="button"
                      variant="outline"
                      size="auto"
                      className="h-auto items-start justify-start rounded-xl p-4 text-left whitespace-normal max-sm:grid max-sm:grid-cols-[auto_1fr] max-sm:items-center max-sm:gap-x-2.5 max-sm:gap-y-1 sm:flex-col sm:gap-2.5"
                      onClick={() => chooseMode(mode)}
                    >
                      <Icon className="size-5 sm:size-10 sm:stroke-[1.25]" />
                      <span>{t(label)}</span>
                      <span className="text-muted-foreground font-normal max-sm:col-start-2">{t(text)}</span>
                    </Button>
                  );
                })}
              </div>
            </motion.div>
          )}
          {inviteMode && channel && <InviteRoleField form={form} channel={channel} held={held} />}
          {/* The chooser stands alone: a list kept from a draft or an earlier mode shows once a mode is picked */}
          {inviteMode && list.hasList && <InviteGroups check={check} list={list} held={held} role={channel ? role : undefined} />}
          {inviteMode && (
            <FormActions>
              <SubmitButton disabled={!invite && !remind} loading={isPending}>
                <SendIcon />
                {t(submitLabel({ invite, remind, isEmpty, held }))}
              </SubmitButton>
              {!children && <CancelButton dirty={form.isDirty} onClick={cancel} />}
              {children}
            </FormActions>
          )}
        </form>
      </Form>
    </MotionConfig>
  );
}
