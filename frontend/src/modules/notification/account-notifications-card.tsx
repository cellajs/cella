import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GetNotificationPreferencesResponse } from 'sdk';
import { ToolCard } from '~/modules/common/tool-card';
import { notificationPreferencesQueryOptions, useUpdateNotificationPreferences } from '~/modules/notification/query';
import { usePushSubscription } from '~/modules/notification/use-push-subscription';
import { Label } from '~/modules/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { Switch } from '~/modules/ui/switch';

type DigestFrequency = 'off' | 'daily' | 'weekly';

type Preferences = GetNotificationPreferencesResponse;
/** `<type>Email` switches, one per notification type in the vocabulary (template and app types). */
type EmailPreferenceKey = Extract<keyof Preferences, `${string}Email`>;
type EmailPreferenceType<K> = K extends `${infer T}Email` ? T : never;

const isEmailPreferenceKey = (key: string): key is EmailPreferenceKey => key.endsWith('Email');

const emailPreferenceType = <K extends EmailPreferenceKey>(key: K): EmailPreferenceType<K> =>
  // Removing the suffix is the inverse of the mapped type, so the substring is that type.
  key.slice(0, -'Email'.length) as EmailPreferenceType<K>;

const cardClass = 'mx-auto sm:w-full';

/** Only email is opt-out: the inbox always fills, so every switch off still delivers the notification. */
export function AccountNotificationsCard() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(notificationPreferencesQueryOptions());
  const { mutate } = useUpdateNotificationPreferences();
  const push = usePushSubscription();

  const emailKeys = Object.keys(data).filter(isEmailPreferenceKey);

  return (
    <ToolCard label="c:notifications" description={t('c:notifications.text')} id="notifications" className={cardClass}>
      <div className="flex flex-col gap-4">
        {emailKeys.map((key) => (
          <div key={key} className="flex items-center gap-4">
            <Switch id={key} checked={data[key]} onCheckedChange={(checked) => mutate({ [key]: checked })} />
            {/* One `c:notifications.<type>_email` key per vocabulary type; apps add theirs to app.json */}
            <Label htmlFor={key}>{t(`c:notifications.${emailPreferenceType(key)}_email`)}</Label>
          </div>
        ))}

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
