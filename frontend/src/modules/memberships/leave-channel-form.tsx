import { UserRoundXIcon } from 'lucide-react';
import { DeleteForm } from '~/modules/common/delete-form';
import { type LeaveChannelProps, useLeaveChannel } from '~/modules/memberships/use-leave-channel';

interface LeaveChannelFormProps extends LeaveChannelProps {
  onCancel: () => void;
}

export function LeaveChannelForm({ channel, redirectPath, callback, onCancel }: LeaveChannelFormProps) {
  const { leave, isPending } = useLeaveChannel(channel, { redirectPath, callback });

  return <DeleteForm label="c:leave" icon={UserRoundXIcon} onDelete={leave} onCancel={onCancel} pending={isPending} />;
}
