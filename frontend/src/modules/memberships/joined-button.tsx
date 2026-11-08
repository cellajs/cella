import { CheckIcon, UserRoundXIcon, XIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MembershipBase } from 'sdk';
import { DeleteForm } from '~/modules/common/delete-form';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { type LeaveChannelProps, useLeaveChannel } from '~/modules/memberships/use-leave-channel';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Confirms leaving `channel`; it closes the dropdown or dialog it renders in once left. */
function LeaveChannelForm({ channel, redirectPath, callback }: LeaveChannelProps) {
  const overlay = useOverlayClose();
  const { leave, isPending } = useLeaveChannel(channel, {
    redirectPath,
    callback: (args) => {
      overlay?.close();
      callback?.(args);
    },
  });

  return <DeleteForm label="c:leave" icon={UserRoundXIcon} onDelete={leave} pending={isPending} />;
}

interface JoinedButtonProps extends LeaveChannelProps {
  /** Shown after the check ("✓ Admin"); without a role the button reads "Joined". */
  role?: MembershipBase['role'] | null;
  /** Hides the label below `xs`. */
  iconOnlyOnPhone?: boolean;
  className?: string;
}

/** The joined state: its check turns into an X on hover or focus, and a click asks to leave in a popconfirm (a drawer below `sm`). */
export function JoinedButton({ role, iconOnlyOnPhone = false, className, ...props }: JoinedButtonProps) {
  const { t } = useTranslation();
  const { channel } = props;

  const openLeaveConfirm = (event: MouseEvent<HTMLButtonElement>) =>
    openConfirm(event.currentTarget, {
      id: `leave-channel-${channel.id}`,
      title: <NamedText i18nKey="c:confirm.leave_channel" name={channel.name} />,
      content: <LeaveChannelForm {...props} />,
    });

  return (
    <Button size="sm" variant="outline" className={cn('group/joined-button', className)} onClick={openLeaveConfirm}>
      <CheckIcon className="text-success group-hover/joined-button:hidden group-focus-visible/joined-button:hidden group-data-dropdowner-active/joined-button:hidden" />
      <XIcon className="hidden group-hover/joined-button:block group-focus-visible/joined-button:block group-data-dropdowner-active/joined-button:block" />
      <span className={cn(iconOnlyOnPhone && 'max-xs:hidden')}>{role ? t(role) : t('c:joined')}</span>
      <span className="sr-only">{t('c:leave')}</span>
    </Button>
  );
}
