import { UserRoundXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type LeaveChannelProps, useLeaveChannel } from '~/modules/memberships/leave-channel-button';
import { Button } from '~/modules/ui/button';

export function LeaveChannelForm({ channel, redirectPath, callback, onCancel }: LeaveChannelProps & { onCancel: () => void }) {
  const { t } = useTranslation();
  const { leave, isPending } = useLeaveChannel(channel, { redirectPath, callback });

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button variant="destructive" loading={isPending} onClick={leave}>
        <UserRoundXIcon />
        {t('c:leave')}
      </Button>
      <Button type="reset" variant="secondary" data-autofocus onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
