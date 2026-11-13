import { PencilLineIcon, RocketIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { prepareRolesText } from '~/modules/entities/draft-roles';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';

const publishDialogId = 'publish-channel';

interface DraftBannerProps {
  channel: { name: string; entityType: ChannelEntityType };
  /** The dialog's buttons, owning the publish mutation; `close` removes the dialog. */
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
    <Alert
      variant="plain"
      className="bg-background border-input rounded-none border-0 border-b border-dashed bg-[repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--foreground)_6%,transparent)_0_2px,transparent_2px_9px)] px-3 py-2"
    >
      <AlertDescription className="flex w-full items-center justify-between gap-3">
        <span className="max-w-measure text-muted-foreground flex gap-2">
          <PencilLineIcon className="text-foreground-soft mt-0.5 size-4 shrink-0" />
          <span>
            <Trans
              t={t}
              i18nKey="c:draft_banner.text"
              values={{ resource: t(`c:${channel.entityType}`), prepareRoles: prepareRolesText(channel.entityType) }}
              components={{ strong: <strong className="text-foreground font-semibold" /> }}
            />
          </span>
        </span>
        <Button ref={buttonRef} size="sm" className="shrink-0" onClick={openPublishDialog}>
          <RocketIcon className="size-3.5" />
          {t('c:publish')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
