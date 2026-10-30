import { RocketIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { prepareRolesText } from '~/modules/entities/draft-roles';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

const publishDialogId = 'publish-channel';

interface DraftBannerProps {
  channel: { name: string; entityType: ChannelEntityType };
  /** The dialog's buttons, which own the publish mutation so its loading state lives in the dialog; `close` removes it. */
  publishForm: (close: () => void) => ReactNode;
}

/** Band under the page header of a draft channel, for those who may publish it. Publishing sends the held invitations, so it asks first. */
export function DraftBanner({ channel, publishForm }: DraftBannerProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openPublishDialog = () => {
    const close = () => dialoger.getState().remove(publishDialogId);
    dialoger.getState().create(publishForm(close), {
      id: publishDialogId,
      triggerRef: buttonRef,
      className: 'max-w-xl',
      title: t('c:publish'),
      description: <NamedText i18nKey="c:confirm.publish_resource" name={channel.name} />,
    });
  };

  return (
    <Alert variant="plain" className="rounded-none border-0 border-b px-3 py-2">
      <AlertDescription className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="max-w-measure text-muted-foreground">
          <NamedText i18nKey="c:draft_banner.text" name={channel.name} values={{ prepareRoles: prepareRolesText(channel.entityType) }} />
        </span>
        <Button ref={buttonRef} size="sm" className="max-sm:w-full" onClick={openPublishDialog}>
          <RocketIcon className="size-3.5" />
          {t('c:publish')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
