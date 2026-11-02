import { ArchiveIcon, ArchiveRestoreIcon, CircleAlertIcon, TrashIcon } from 'lucide-react';
import { type ReactNode, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, isChannelArchivable } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import type { PlacementDescriptor } from '~/lib/placements';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { buildMembershipUpdate } from '~/modules/memberships/build-membership-update';
import { canRestoreNow, useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { Button } from '~/modules/ui/button';

/** Bases a module spreads into its `tools` with a `slot` and a `render`. Orders: general 10, details 20, tabs 80, danger 90; module tools default to 50. */
export const generalToolBase = {
  id: 'general',
  label: 'c:general',
  order: 10,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

export const detailsToolBase = { id: 'details', label: 'c:details', order: 20 } satisfies PlacementDescriptor;

export const tabsToolBase = {
  id: 'tabs',
  label: 'c:tabs',
  order: 80,
  locked: true,
  requires: 'update',
} satisfies PlacementDescriptor;

export function dangerToolBase(channelType: ChannelEntityType, resource: TKey): PlacementDescriptor {
  return {
    id: `delete-${channelType}`,
    label: 'c:delete_resource',
    resource,
    order: 90,
    locked: true,
    requires: 'delete',
  };
}

/** The way out for someone who only wants a channel gone for themselves: archiving their own membership. */
function ArchiveForMe({ channel, name }: { channel: EnrichedChannel; name: string }) {
  const { t } = useTranslation();
  const { mutate: updateMembership } = useMemberUpdateMutation();

  const { membership } = channel;
  if (!membership || !isChannelArchivable(channel.entityType)) return null;
  const { archived } = membership;

  const toggleArchived = () => {
    if (archived && !canRestoreNow()) return;
    updateMembership(buildMembershipUpdate({ ...channel, membership }, { archived: !archived }));
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4">
      <p className="min-w-64 flex-1 text-muted-foreground text-sm">
        <NamedText i18nKey={archived ? 'c:archived_for_me_notice.text' : 'c:archive_for_me_notice.text'} name={name} />
      </p>
      <Button variant="outline" size="sm" onClick={toggleArchived}>
        {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        {archived ? t('c:restore') : t('c:archive_for_me')}
      </Button>
    </div>
  );
}

interface DeleteToolCardProps {
  /** Entity display name, interpolated into the notice and confirm texts. */
  name: string;
  /** i18n resource key for the entity, e.g. 'c:organization'. */
  resource: TKey;
  /** Dialog id, also the aside anchor's danger id (e.g. 'delete-organization'). */
  dialogId: string;
  renderDialog: () => ReactNode;
  /** The card's notice; defaults to the permanent-delete notice, interpolated with `name`, `resource` and `values`. */
  notice?: TKey;
  values?: Record<string, string | number>;
  /** Why the entity cannot be deleted now: the button is disabled and this note shows below it. */
  disabledReason?: TKey;
  /** The channel the card deletes: below the button, viewers with a membership can also archive it for themselves. */
  channel?: EnrichedChannel;
}

export function DeleteToolCard({
  name,
  resource,
  dialogId,
  renderDialog,
  notice = 'c:delete_resource_notice.text',
  values,
  disabledReason,
  channel,
}: DeleteToolCardProps) {
  const { t } = useTranslation();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const resourceName = t(resource);

  const openDeleteDialog = () => {
    // Suspense: dialog content is typically a lazy-loaded per-entity component
    dialoger.getState().create(<Suspense fallback={null}>{renderDialog()}</Suspense>, {
      id: dialogId,
      triggerRef: deleteButtonRef,
      className: 'md:max-w-xl',
      title: t('c:delete_resource', { resource: resourceName }),
      description: <NamedText i18nKey="c:confirm.delete_resource" name={name} values={{ resource: resourceName }} />,
    });
  };

  return (
    <ToolCard
      label="c:delete_resource"
      resource={resource}
      description={<NamedText i18nKey={notice} name={name} values={{ resource: resourceName, ...values }} />}
    >
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" disabled={!!disabledReason} onClick={openDeleteDialog}>
        <TrashIcon />
        <span>{t('c:delete_resource', { resource: resourceName })}</span>
      </Button>
      {disabledReason && (
        <p className="mt-4 flex items-center gap-1 text-muted-foreground text-sm italic">
          <CircleAlertIcon />
          {t(disabledReason)}
        </p>
      )}
      {channel && <ArchiveForMe channel={channel} name={name} />}
    </ToolCard>
  );
}
