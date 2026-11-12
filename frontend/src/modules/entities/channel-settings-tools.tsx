import { useQuery } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, CircleAlertIcon, EyeIcon, EyeOffIcon, TrashIcon } from 'lucide-react';
import { type ReactNode, Suspense, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, hierarchy, isChannelHideable, type ProductEntityType } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import type { PlacementDescriptor } from '~/lib/placements';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { ToolCard } from '~/modules/common/tool-card';
import { useArchiveChannelMutation } from '~/modules/entities/query';
import type { EnrichedChannel } from '~/modules/entities/types';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { buildMembershipUpdate } from '~/modules/memberships/build-membership-update';
import { canShowNow, useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { Button } from '~/modules/ui/button';
import { Label } from '~/modules/ui/label';
import { Switch } from '~/modules/ui/switch';
import { findMembership } from '~/query/enrichment/helpers';

/** Bases a module spreads into its `tools` with a `slot` and a `render`. Orders: general 10, details 20, tabs 80, archive 85, danger 90; module tools default to 50. */
export const generalToolBase = { id: 'general', label: 'c:general', order: 10, locked: true, requires: 'update' } satisfies PlacementDescriptor;

export const detailsToolBase = { id: 'details', label: 'c:details', order: 20, requires: 'update' } satisfies PlacementDescriptor;

export const tabsToolBase = { id: 'tabs', label: 'c:tabs', order: 80, locked: true, requires: 'update' } satisfies PlacementDescriptor;

/**
 * For a channel below the organization, which `ArchiveToolCard` archives and unarchives.
 * @public
 */
export function archiveToolBase(channelType: ChannelEntityType, resource: TKey): PlacementDescriptor {
  return { id: `archive-${channelType}`, label: 'c:archive_resource', resource, order: 85, locked: true, requires: 'archive' };
}

export function dangerToolBase(channelType: ChannelEntityType, resource: TKey): PlacementDescriptor {
  return { id: `delete-${channelType}`, label: 'c:delete_resource', resource, order: 90, locked: true, requires: 'delete' };
}

interface ArchiveChannelFormProps {
  channel: EnrichedChannel;
  /** The switch that takes the channels inside along, with its starting state; without it they keep their state. */
  descendants?: { label: string; on: boolean };
  close: () => void;
}

/** Confirms an archive, or an unarchive of an archived channel. */
function ArchiveChannelForm({ channel, descendants, close }: ArchiveChannelFormProps) {
  const { t } = useTranslation();
  const switchId = useId();
  const [includeDescendants, setIncludeDescendants] = useState(descendants?.on ?? false);
  const { mutate, isPending } = useArchiveChannelMutation();

  const archives = !channel.archived;
  const confirm = () => mutate({ channel, archived: archives, includeDescendants }, { onSuccess: close });

  return (
    <div className="flex flex-col gap-6">
      {descendants && (
        <div className="flex items-center gap-4">
          <Switch id={switchId} checked={includeDescendants} onCheckedChange={(checked) => setIncludeDescendants(checked)} />
          <Label htmlFor={switchId}>{descendants.label}</Label>
        </div>
      )}
      <ConfirmForm
        icon={archives ? ArchiveIcon : ArchiveRestoreIcon}
        label={t(archives ? 'c:archive' : 'c:unarchive')}
        pending={isPending}
        onConfirm={confirm}
      />
    </div>
  );
}

/** A channel as the archive card reads it; with `include=counts` it tells how many channels are inside it. */
type ArchiveCardChannel = EnrichedChannel & { included?: { counts?: { entities?: Partial<Record<ChannelEntityType | ProductEntityType, number>> } } };

interface ArchiveToolCardProps {
  channel: ArchiveCardChannel;
  /** Display name for the notice and confirm texts. */
  name: string;
  resource: TKey;
  /** Whether the confirmation's switch that takes the channels inside along starts on or off, or is left out. */
  descendantsDefault: 'on' | 'off' | 'hidden';
}

/**
 * Archives a channel below the organization, which closes it to writes, or unarchives it.
 * @public
 */
export function ArchiveToolCard({ channel, name, resource, descendantsDefault }: ArchiveToolCardProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { archived } = channel;
  const resourceName = t(resource);
  const dialogId = `archive-${channel.entityType}`;

  const descendantTypes = hierarchy.getOrderedDescendants(channel.entityType).filter(hierarchy.isChannel);
  const counts = descendantTypes.flatMap((type) => channel.included?.counts?.entities?.[type] ?? []);
  const descendantCount = counts.length ? counts.reduce((sum, count) => sum + count, 0) : undefined;
  const descendants =
    descendantsDefault === 'hidden' || !descendantTypes.length || descendantCount === 0
      ? undefined
      : {
          label: archived ? t('c:unarchive_descendants.text') : t('c:archive_descendants.text', { count: descendantCount }),
          on: descendantsDefault === 'on',
        };

  const openDialog = () => {
    const close = () => dialoger.getState().remove(dialogId);
    dialoger.getState().create(<ArchiveChannelForm channel={channel} descendants={descendants} close={close} />, {
      id: dialogId,
      triggerRef: buttonRef,
      className: 'md:max-w-xl',
      title: t(archived ? 'c:unarchive_resource' : 'c:archive_resource', { resource: resourceName }),
      description: (
        <NamedText
          i18nKey={archived ? 'c:confirm.unarchive_resource' : 'c:confirm.archive_resource'}
          name={name}
          values={{ resource: resourceName }}
        />
      ),
    });
  };

  return (
    <ToolCard
      label={archived ? 'c:unarchive_resource' : 'c:archive_resource'}
      resource={resource}
      description={<NamedText i18nKey={archived ? 'c:archived_notice.text' : 'c:archive_notice.text'} name={name} />}
    >
      <Button ref={buttonRef} variant="outline" className="w-full sm:w-auto" onClick={openDialog}>
        {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        <span>{t(archived ? 'c:unarchive' : 'c:archive')}</span>
      </Button>
    </ToolCard>
  );
}

/** The way out for someone who only wants a channel gone for themselves: hiding their own membership. */
function HideForMe({ channel, name }: { channel: EnrichedChannel; name: string }) {
  const { t } = useTranslation();
  const { mutate: updateMembership } = useMemberUpdateMutation();
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());

  const membership = findMembership(myMemberships?.results ?? [], channel.id);
  if (!membership || !isChannelHideable(channel.entityType)) return null;
  const { hidden } = membership;

  const toggleHidden = () => {
    if (hidden && !canShowNow()) return;
    updateMembership(buildMembershipUpdate({ ...channel, membership }, { hidden: !hidden }));
  };

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4">
      <p className="text-muted-foreground min-w-64 flex-1 text-sm">
        <NamedText i18nKey={hidden ? 'c:hidden_for_me_notice.text' : 'c:hide_for_me_notice.text'} name={name} />
      </p>
      <Button variant="outline" size="sm" onClick={toggleHidden}>
        {hidden ? <EyeIcon /> : <EyeOffIcon />}
        {hidden ? t('c:show') : t('c:hide_for_me')}
      </Button>
    </div>
  );
}

interface DeleteToolCardProps {
  /** Display name for the notice and confirm texts. */
  name: string;
  resource: TKey;
  /** Also the aside anchor's danger id (e.g. 'delete-organization'). */
  dialogId: string;
  renderDialog: () => ReactNode;
  /** Interpolated with `name`, `resource` and `values`. */
  notice?: TKey;
  values?: Record<string, string | number>;
  /** Disables the button and shows below it. */
  disabledReason?: TKey;
  /** Lets a member hide it for themselves, below the button. */
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
        <p className="text-muted-foreground mt-4 flex items-center gap-1 text-sm italic">
          <CircleAlertIcon />
          {t(disabledReason)}
        </p>
      )}
      {channel && <HideForMe channel={channel} name={name} />}
    </ToolCard>
  );
}
