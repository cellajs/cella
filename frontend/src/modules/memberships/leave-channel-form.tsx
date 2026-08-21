import { useTranslation } from 'react-i18next';
import { LeaveChannelButton, type LeaveChannelButtonProps } from '~/modules/memberships/leave-channel-button';
import { Button } from '~/modules/ui/button';

export function LeaveChannelForm({ onCancel, ...props }: LeaveChannelButtonProps & { onCancel: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <LeaveChannelButton {...props} buttonProps={{ variant: 'destructive', className: 'justify-center sm:w-auto' }} />
      <Button type="reset" variant="secondary" aria-label="Cancel" onClick={onCancel}>
        {t('c:cancel')}
      </Button>
    </div>
  );
}
