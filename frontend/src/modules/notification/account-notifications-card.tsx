import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ToolCard } from '~/modules/common/tool-card';
import { notificationPreferencesQueryOptions, useUpdateNotificationPreferences } from '~/modules/notification/query';
import { usePushSubscription } from '~/modules/notification/use-push-subscription';
import { Label } from '~/modules/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { Switch } from '~/modules/ui/switch';

type DigestFrequency = 'off' | 'daily' | 'weekly';

const cardClass = 'mx-auto sm:w-full';

/** Only email is opt-out: the inbox always fills, so every switch off still delivers the mention. */
export function AccountNotificationsCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(notificationPreferencesQueryOptions());
  const { mutate } = useUpdateNotificationPreferences();
  const push = usePushSubscription();

  return (
    <ToolCard label="c:notifications" description={t('c:notifications.text')} id="notifications" className={cardClass}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Switch
            id="mentionEmail"
            checked={data.mentionEmail}
            onCheckedChange={(mentionEmail) => mutate({ mentionEmail })}
          />
          <Label htmlFor="mentionEmail">{t('c:notifications.mention_email')}</Label>
        </div>

        <div className="flex items-center gap-4">
          <Switch
            id="commentEmail"
            checked={data.commentEmail}
            onCheckedChange={(commentEmail) => mutate({ commentEmail })}
          />
          <Label htmlFor="commentEmail">{t('c:notifications.comment_email')}</Label>
        </div>

        {push.supported && (
          <div className="flex items-center gap-4">
            <Switch
              id="pushEnabled"
              checked={push.enabled}
              disabled={push.busy}
              onCheckedChange={(checked) => (checked ? push.enable() : push.disable())}
            />
            <Label htmlFor="pushEnabled">{t('c:notifications.push')}</Label>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="digest">{t('c:notifications.digest')}</Label>
          <Select value={data.digest} onValueChange={(digest) => mutate({ digest: digest as DigestFrequency })}>
            <SelectTrigger id="digest" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('c:notifications.digest_off')}</SelectItem>
              <SelectItem value="daily">{t('c:notifications.digest_daily')}</SelectItem>
              <SelectItem value="weekly">{t('c:notifications.digest_weekly')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </ToolCard>
  );
}
