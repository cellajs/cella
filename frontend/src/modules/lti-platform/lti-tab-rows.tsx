import { useSuspenseQueries } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListPlaceableLtiInstallationsResponse, LtiResourceLink } from 'sdk';
import { ltiTabId } from 'shared/tools-config';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import {
  ltiResourceLinksQueryOptions,
  placeableLtiInstallationsQueryOptions,
  useCreateLtiResourceLinkMutation,
  useDeleteLtiResourceLinkMutation,
} from '~/modules/lti-platform/query';
import { Switch } from '~/modules/ui/switch';

type PlaceableLtiInstallation = ListPlaceableLtiInstallationsResponse['results'][number];

/** An approved LTI tool as a row of a channel's tabs: its tab is there while its resource link is. */
export interface LtiTabRow {
  id: string;
  name: string;
  installation: PlaceableLtiInstallation;
  link?: LtiResourceLink;
}

/** Every approved LTI tool as a row of the channel's tabs: the placed ones in the tab bar's order, then the others. */
export function useLtiTabRows(channel: EnrichedChannel): LtiTabRow[] {
  const [{ data: installations }, { data: links }] = useSuspenseQueries({
    queries: [placeableLtiInstallationsQueryOptions(channel), ltiResourceLinksQueryOptions(channel)],
  });
  const rows = installations.results.map((installation) => {
    const link = links.results.find(({ installationId }) => installationId === installation.id);
    // A placed tab goes by its own title, as the tab bar shows it
    return { id: ltiTabId(installation.id), name: link?.title ?? installation.name, installation, link };
  });
  const placed = links.results.flatMap((link) => rows.filter((row) => row.link?.id === link.id));
  return [...placed, ...rows.filter((row) => !row.link)];
}

/** Why the caller may not place the row's tab, while it is not placed. */
export function LtiTabRefusal({ row }: { row: LtiTabRow }) {
  const { t } = useTranslation();
  if (row.link || row.installation.placeable) return null;
  return <span className="text-muted-foreground text-xs leading-tight">{t('c:lti_tab_course_required.text')}</span>;
}

interface LtiTabSwitchProps {
  channel: EnrichedChannel;
  row: LtiTabRow;
  tabIndex: number;
  /** Right before the tab is placed or removed. */
  onToggle: () => void;
}

/** Places or removes an LTI tool's tab; placing one that reads course members asks first, naming the course it reads. */
export function LtiTabSwitch({ channel, row, tabIndex, onToggle }: LtiTabSwitchProps) {
  const { t } = useTranslation();
  const switchRef = useRef<HTMLElement>(null);
  const { mutate: create, isPending: placing } = useCreateLtiResourceLinkMutation();
  const { mutate: remove, isPending: removing } = useDeleteLtiResourceLinkMutation();
  const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
  const { installation, link } = row;

  const place = () => {
    onToggle();
    create({ path, body: { channelType: channel.entityType, channelId: channel.id, installationId: installation.id, title: installation.name } });
  };

  const confirmPlace = (trigger: HTMLElement, course: NonNullable<PlaceableLtiInstallation['context']>) =>
    openConfirm(trigger, {
      id: `place-lti-tab-${installation.id}`,
      title: (
        <NamedText
          i18nKey={course.channelId === channel.id ? 'c:confirm.add_lti_tab' : 'c:confirm.add_lti_tab_above'}
          name={installation.name}
          values={{ course: course.name ?? '' }}
        />
      ),
      content: (
        <ConfirmForm
          label={t('c:add_resource', { resource: t('c:tab') })}
          icon={PlusIcon}
          pending={false}
          onConfirm={() => {
            dropdowner.getState().remove();
            place();
          }}
        />
      ),
    });

  const onCheckedChange = (checked: boolean) => {
    if (!checked) {
      if (!link) return;
      onToggle();
      return remove({ path: { ...path, ltiResourceLinkId: link.id }, channelId: channel.id });
    }
    // A course to read and the grant to read it: the person sees whose people the LTI tool reads before it does
    const { context } = installation;
    if (installation.readsMembers && context && switchRef.current) return confirmPlace(switchRef.current, context);
    place();
  };

  return (
    <Switch
      ref={switchRef}
      aria-label={`${row.name}: ${t('c:visible')}`}
      tabIndex={tabIndex}
      checked={placing || (!!link && !removing)}
      disabled={placing || removing || (!link && !installation.placeable)}
      onCheckedChange={onCheckedChange}
    />
  );
}
