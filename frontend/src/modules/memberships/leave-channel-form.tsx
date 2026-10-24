import { UserRoundXIcon } from 'lucide-react';
import { DeleteForm } from '~/modules/common/delete-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { type LeaveChannelProps, useLeaveChannel } from '~/modules/memberships/use-leave-channel';

/** Confirms leaving `channel`; it closes the dropdown or dialog it renders in once left. */
export function LeaveChannelForm({ channel, redirectPath, callback }: LeaveChannelProps) {
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
