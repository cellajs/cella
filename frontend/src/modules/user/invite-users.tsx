import i18n from 'i18next';
import { ChevronRightIcon, CircleAlertIcon, CircleCheckIcon, ClipboardPasteIcon, ClockIcon, MailIcon, SendIcon, UsersRoundIcon } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
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
import { fadeMotion, scaleInMotion } from '~/modules/common/motion-presets';
import { NamedText } from '~/modules/common/named-text';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { Form, FormField, FormItem, FormLabel } from '~/modules/ui/field';
import { InviteBulkField, InviteEmailField, InviteSearchField } from '~/modules/user/invite-fields';
import { InviteGroups } from '~/modules/user/invite-groups';
import {
  type InviteFieldProps,
  type InviteForm,
  type InviteReport,
  inviteDialogId,
  useInviteFormDraft,
  useInviteSubmit,
} from '~/modules/user/invite-submit';
import { useInviteCheck } from '~/modules/user/use-invite-check';
import { useInviteList } from '~/modules/user/use-invite-list';
import { cn } from '~/utils/cn';
import { focusOnMount } from '~/utils/focus-on-mount';
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

/** Per mode: its name on the chooser, its crumb in the dialog title, its icon and its field. */
const inviteModes: Record<InviteMode, { label: TKey; crumb: TKey; icon: IconComponent; Field: ComponentType<InviteFieldProps> }> = {
  email: { label: 'c:invite_mode_email', crumb: 'c:email', icon: MailIcon, Field: InviteEmailField },
  search: { label: 'c:invite_mode_search', crumb: 'c:people', icon: UsersRoundIcon, Field: InviteSearchField },
  bulk: { label: 'c:invite_mode_bulk', crumb: 'c:paste', icon: ClipboardPasteIcon, Field: InviteBulkField },
};

interface InviteTitleProps {
  mode: InviteMode | null;
  onBack: () => void;
}

/** The dialog title. In a mode, its first crumb goes back to the chooser and the mode's crumb fades in beside it. */
function InviteTitle({ mode, onBack }: InviteTitleProps) {
  const { t } = useTranslation();

  return (
    <span className="flex items-center gap-2">
      {mode ? (
        <button type="button" className="focus-effect link-reveal rounded-sm" onClick={onBack}>
          {t('c:invite')}
        </button>
      ) : (
        <UnsavedBadge title={t('c:invite')} />
      )}
      <AnimatePresence>
        {mode && (
          <motion.span className="flex items-center gap-2" {...fadeMotion}>
            <ChevronRightIcon className="text-faint-foreground" />
            <UnsavedBadge title={t(inviteModes[mode].crumb)} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

interface SubmitLabelOptions {
  invite: number;
  resend: number;
  isEmpty: boolean;
  held: boolean;
}

const submitLabel = ({ invite, resend, isEmpty, held }: SubmitLabelOptions): TKey => {
  if (!invite && !resend) return isEmpty ? 'c:invite' : 'c:nothing_to_send';
  if (held) return 'c:save';
  if (invite && resend) return 'c:invite_and_resend';
  return resend ? 'c:resend' : 'c:invite';
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
  /** Rendered in the `invite-users` dialog, which a send closes once nothing is left to send again. */
  dialog?: boolean;
  /** Skips the chooser. Without the dialog's title there is no way back to it. */
  mode?: InviteMode;
}

/** The invite form. The mode only swaps its field, so the form, its draft and a running send outlive a switch. */
export function InviteUsers({ channel, dialog, mode: initialMode }: InviteUsersProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);

  const [inviteMode, setInviteMode] = useState<InviteMode | null>(initialMode ?? null);
  const [report, setReport] = useState<InviteReport | null>(null);

  const form = useInviteFormDraft(channel?.id, channel?.entityType);
  const list = useInviteList(form);
  const role = useWatch({ control: form.control, name: 'role' });

  const held = !!channel && isUnpublishedDraft(channel) && !hierarchy.getPrepareRoles(channel.entityType).includes(role);
  const check = useInviteCheck(channel, list.emails, list.unparsed, held, list.people, role);

  const close = () => {
    if (dialog) dialoger.getState().remove(inviteDialogId);
  };

  const { onSubmit, isPending } = useInviteSubmit({
    channel,
    shownOut: check.groups.out,
    onDone: () => {
      list.reset();
      close();
    },
    onPartial: (next) => {
      list.keep(next.unsent);
      setReport(next);
    },
  });

  // The list stays across a switch.
  const chooseMode = (mode: InviteMode | null) => {
    list.leaveField();
    setInviteMode(mode);
    if (dialog) dialoger.getState().update(inviteDialogId, { titleContent: <InviteTitle mode={mode} onBack={() => chooseMode(null)} /> });
  };

  // Searching people needs a channel to check them against.
  const modes: InviteMode[] = channel ? ['email', 'search', 'bulk'] : ['email', 'bulk'];
  const Field = inviteMode ? inviteModes[inviteMode].Field : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReport(null);
    if (list.commitTyped() && list.commitPasted()) form.handleSubmit(onSubmit)(event);
  };

  const cancel = () => {
    list.reset();
    setReport(null);
    formRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  };

  // An address the check could not answer for still goes: the send decides, and its result says what happened.
  const invite = check.groups.new.length + check.groups.unchecked.length + (list.typedAddress ? 1 : 0);
  const resend = check.groups.again.length;
  const isEmpty = !list.hasList && !list.typed.trim();
  // A report holds while the list is what its send left there
  const shownReport = report && report.unsent.join() === list.emails.join() ? report : null;

  return (
    <MotionConfig transition={scaleInMotion.transition}>
      <Form {...form}>
        {/* popLayout takes the leaving chooser out of the flow, which needs a positioned parent */}
        <form ref={formRef} noValidate onSubmit={submit} className="relative">
          <AnimatePresence mode="popLayout">
            {inviteMode && Field ? (
              <motion.div key="invite-form" {...scaleInMotion} className="flex flex-col gap-6">
                <Field channel={channel} check={check} list={list} autoFocus={!initialMode} onToEmail={() => chooseMode('email')} />
                {channel && <InviteRoleField form={form} channel={channel} held={held} />}
                {/* Stays mounted, so a report is announced */}
                <p role="status" className={cn('flex items-center gap-2 text-sm', !shownReport && 'sr-only')}>
                  {shownReport && (
                    <>
                      {shownReport.anySent ? <CircleCheckIcon className="text-success" /> : <CircleAlertIcon className="text-warning" />}
                      {shownReport.text}
                    </>
                  )}
                </p>
                {/* The chooser stands alone: a list kept from a draft or an earlier mode shows once a mode is picked */}
                {list.hasList && <InviteGroups check={check} list={list} held={held} role={channel ? role : undefined} />}
                <FormActions>
                  <SubmitButton disabled={!invite && !resend} loading={isPending}>
                    <SendIcon />
                    {t(submitLabel({ invite, resend, isEmpty, held }))}
                  </SubmitButton>
                  <CancelButton dirty={form.isDirty} onClick={cancel} />
                </FormActions>
              </motion.div>
            ) : (
              // What held focus is gone: the pressed crumb, or the trigger behind the dialog on arrival
              <motion.div
                key="invite-initial"
                ref={focusOnMount}
                tabIndex={-1}
                {...scaleInMotion}
                exit={{ scale: 0.9, opacity: 0 }}
                className="grid w-full gap-2 py-3 outline-hidden sm:h-40 sm:auto-cols-fr sm:grid-flow-col sm:gap-3"
              >
                {modes.map((mode) => {
                  const { label, icon: Icon } = inviteModes[mode];
                  return (
                    <Button
                      key={mode}
                      type="button"
                      variant="outline"
                      size="auto"
                      className="group/tile gap-3 rounded-xl p-3 py-6 text-left sm:py-10"
                      onClick={() => chooseMode(mode)}
                    >
                      <Icon className="size-12 stroke-1" />
                      <span className="flex flex-col truncate">
                        <span>{t(label)}</span>
                        <span className="text-muted-foreground group-hover/tile:text-foreground mt-1 flex items-center truncate transition-colors">
                          <strong>{t('c:continue')}</strong>
                          <ChevronRightIcon className="ml-1" />
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Form>
    </MotionConfig>
  );
}
