import { CheckIcon, XIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MembershipBase } from 'sdk';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { NamedText } from '~/modules/common/named-text';
import { PopConfirm } from '~/modules/common/popconfirm';
import { LeaveChannelForm } from '~/modules/memberships/leave-channel-form';
import type { LeaveChannelProps } from '~/modules/memberships/use-leave-channel';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface JoinedButtonProps extends LeaveChannelProps {
  /** Shown after the check ("✓ Admin"); without a role the button reads "Joined". */
  role?: MembershipBase['role'] | null;
  size?: ButtonProps['size'];
  className?: string;
}

/** The joined state: its check turns into an X on hover or focus, and a click asks to leave in a popconfirm (a drawer below `sm`). */
export function JoinedButton({ role, size = 'sm', className, ...props }: JoinedButtonProps) {
  const { t } = useTranslation();
  const { channel } = props;

  const openLeaveConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    const { create, remove } = dropdowner.getState();
    create(
      <PopConfirm title={<NamedText i18nKey="c:confirm.leave_channel" name={channel.name} />}>
        <LeaveChannelForm
          {...props}
          callback={(args) => {
            remove();
            props.callback?.(args);
          }}
          onCancel={remove}
        />
      </PopConfirm>,
      { id: 'leave-channel', triggerId: `leave-channel-${channel.id}`, triggerRef: { current: event.currentTarget }, align: 'end' },
    );
  };

  return (
    <Button size={size} variant="success" className={cn('group/joined-button', className)} onClick={openLeaveConfirm}>
      <CheckIcon className="group-hover/joined-button:hidden group-focus-visible/joined-button:hidden group-data-dropdowner-active/joined-button:hidden" />
      <XIcon className="hidden group-hover/joined-button:block group-focus-visible/joined-button:block group-data-dropdowner-active/joined-button:block" />
      <span className="max-xs:hidden">{role ? t(role) : t('c:joined')}</span>
      <span className="sr-only">{t('c:leave')}</span>
    </Button>
  );
}
