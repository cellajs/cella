import type { VariantProps } from 'class-variance-authority';
import { CheckIcon, XIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MembershipBase } from 'sdk';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { PopConfirm } from '~/modules/common/popconfirm';
import type { LeaveChannelButtonProps } from '~/modules/memberships/leave-channel-button';
import { LeaveChannelForm } from '~/modules/memberships/leave-channel-form';
import { Button, type buttonVariants } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type JoinedButtonProps = Omit<LeaveChannelButtonProps, 'buttonProps'> & {
  /** Membership role shown on the trigger ("✓ Admin"). */
  role?: MembershipBase['role'] | null;
  size?: VariantProps<typeof buttonVariants>['size'];
  className?: string;
};

/**
 * Joined-state membership button: a "✓ Role" trigger whose checkmark swaps to an X on hover/focus
 * to signal that clicking undoes the join. Clicking opens a leave popconfirm through the
 * dropdowner, so it renders as a drawer below the `sm` breakpoint.
 */
function JoinedButton({ role, size = 'sm', className, ...props }: JoinedButtonProps) {
  const { t } = useTranslation();
  const { channel } = props;

  const openLeaveConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    const { create, remove } = useDropdowner.getState();
    create(
      <PopConfirm title={t('c:confirm.leave_channel', { name: channel.name })}>
        <LeaveChannelForm
          {...props}
          callback={(args) => {
            remove();
            props.callback?.(args);
          }}
          onCancel={remove}
        />
      </PopConfirm>,
      {
        id: 'leave-channel',
        triggerId: `leave-channel-${channel.id}`,
        triggerRef: { current: event.currentTarget },
        align: 'end',
      },
    );
  };

  return (
    <Button
      size={size}
      variant="success"
      className={cn('group', className)}
      aria-label={t('c:leave')}
      onClick={openLeaveConfirm}
    >
      <CheckIcon className="group-hover:hidden group-focus-visible:hidden group-data-dropdowner-active:hidden" />
      <XIcon className="hidden group-hover:block group-focus-visible:block group-data-dropdowner-active:block" />
      <span className="ml-1 max-xs:hidden">{role ? t(role) : t('c:joined')}</span>
    </Button>
  );
}

export { JoinedButton };
