import { useQuery } from '@tanstack/react-query';
import { CheckIcon, ChevronDownIcon, PencilIcon, UsersIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListLtiTabsResponse, LtiResourceLink } from 'sdk';
import { zLtiResourceLink } from 'sdk/zod.gen';
import { ltiTabId } from 'shared/tools-config';
import { DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import type { IconComponent } from '~/modules/common/icons/types';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { LtiToolOrigin, sharesNameAmong } from '~/modules/lti-platform/lti-tool-origin';
import { ltiTabsQueryOptions, useCreateLtiResourceLinkMutation, useUpdateLtiResourceLinkMutation } from '~/modules/lti-platform/query';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';

type LtiTab = ListLtiTabsResponse['results'][number];

/** An approved LTI tool as a row of a channel's tabs: placed once its resource link exists, on or off. */
export interface LtiTabRow {
  id: string;
  name: string;
  tab: LtiTab;
  /** Another LTI tool's row carries the same name: the row shows what tells them apart. */
  sharesName: boolean;
}

/**
 * The channel's LTI tabs as rows, read in the card with their own pending and failed state: the placed ones in the order
 * they were placed, as the tab bar has them, then the LTI tools never placed here.
 */
export function useLtiTabRows(channel: EnrichedChannel) {
  const query = useQuery(ltiTabsQueryOptions(channel));
  const named = (query.data?.results ?? []).map((tab) => ({ id: ltiTabId(tab.id), name: tab.resourceLink?.title ?? tab.name, tab }));
  const sharesName = sharesNameAmong(named);
  const rows: LtiTabRow[] = named.map((row) => ({ ...row, sharesName: sharesName(row.name) }));
  // Resource link ids are UUID v7: their order is the order they were placed
  const placed = rows
    .filter((row) => row.tab.resourceLink)
    .sort((a, b) => (a.tab.resourceLink?.id ?? '').localeCompare(b.tab.resourceLink?.id ?? ''));
  return { rows: [...placed, ...rows.filter((row) => !row.tab.resourceLink)], query };
}

/** The hosts the row's LTI tool launches to and the moment it was added, when another row carries the same name. */
export function LtiTabOrigin({ row }: { row: LtiTabRow }) {
  if (!row.sharesName) return null;
  return <LtiToolOrigin launchOrigins={row.tab.launchOrigins} createdAt={row.tab.createdAt} />;
}

/** Why the row's tab cannot be switched on: a disabled LTI tool, or one an admin did not allow in the channel's type. */
export function LtiTabRefusal({ row, channel }: { row: LtiTabRow; channel: EnrichedChannel }) {
  const { t } = useTranslation();
  const { refusal } = row.tab;
  if (!refusal) return null;
  const text =
    refusal === 'lti_installation_disabled'
      ? t('c:lti_tab_tool_disabled.text')
      : t('error:lti_channel_type_not_allowed.text', { resource: t(`c:${channel.entityType}`) });
  return <span className="text-muted-foreground text-xs leading-tight">{text}</span>;
}

type LtiAudience = LtiResourceLink['audience'];

const audienceIcons = { members: UsersIcon, editors: PencilIcon } as const satisfies Record<LtiAudience, IconComponent>;

interface LtiAudienceChoiceProps {
  channel: EnrichedChannel;
  /** The tab's audience now; none for a tab never placed. */
  current?: LtiAudience;
  onChoose: (audience: LtiAudience) => void;
}

/**
 * Whom a tab opens for, as dropdowner items: its channel's members, or those who may change the channel. A label wraps
 * where a confirmation's width cuts it.
 */
function LtiAudienceChoice({ channel, current, onChoose }: LtiAudienceChoiceProps) {
  const { t } = useTranslation();
  const resource = t(`c:${channel.entityType}`);
  return zLtiResourceLink.shape.audience.options.map((audience) => (
    <DropdownActionItem key={audience} icon={audienceIcons[audience]} selected={audience === current} onSelect={() => onChoose(audience)}>
      <span className="min-w-0 grow text-left">{t(`c:lti_audience.${audience}`, { resource })}</span>
      <CheckIcon className={cn('text-success size-4 shrink-0', audience !== current && 'invisible')} />
    </DropdownActionItem>
  ));
}

/** Whom a placed tab opens for, changed in place by whoever may switch it. */
export function LtiTabAudience({ channel, row, tabIndex }: { channel: EnrichedChannel; row: LtiTabRow; tabIndex: number }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { mutate: update, isPending, variables } = useUpdateLtiResourceLinkMutation();
  const link = row.tab.resourceLink;
  if (!link) return null;

  const audience = (isPending && variables?.body.audience) || link.audience;
  const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel), ltiResourceLinkId: link.id };
  const id = `lti-tab-audience-${link.id}`;
  const choose = (next: LtiAudience) => next !== audience && update({ path, body: { audience: next } });
  const open = () =>
    dropdowner.getState().create(<LtiAudienceChoice channel={channel} current={audience} onChoose={choose} />, {
      id,
      triggerId: id,
      triggerRef,
      align: 'start',
      kind: 'menu',
    });

  return (
    <Button
      ref={triggerRef}
      variant="ghost"
      size="micro"
      tabIndex={tabIndex}
      className="text-muted-foreground -ml-1 w-fit font-normal"
      onClick={open}
    >
      {t(`c:lti_audience.${audience}`, { resource: t(`c:${channel.entityType}`) })}
      <ChevronDownIcon className="size-3" />
    </Button>
  );
}

interface LtiTabSwitchProps {
  channel: EnrichedChannel;
  row: LtiTabRow;
  tabIndex: number;
  /** Right before the tab is placed or switched. */
  onToggle: () => void;
}

/**
 * Switches an LTI tool's tab on and off, keeping its resource link. Switching on asks whom it opens for, and names whose
 * people the LTI tool then reads where it may.
 */
export function LtiTabSwitch({ channel, row, tabIndex, onToggle }: LtiTabSwitchProps) {
  const { t } = useTranslation();
  const switchRef = useRef<HTMLElement>(null);
  const { mutate: create, isPending: placing } = useCreateLtiResourceLinkMutation();
  const { mutate: update, isPending: switching, variables } = useUpdateLtiResourceLinkMutation();
  const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
  const { tab } = row;
  const link = tab.resourceLink;

  const switchOff = () => {
    onToggle();
    if (link) update({ path: { ...path, ltiResourceLinkId: link.id }, body: { enabled: false } });
  };

  const switchOn = (audience: LtiAudience) => {
    onToggle();
    if (link) return update({ path: { ...path, ltiResourceLinkId: link.id }, body: { enabled: true, audience } });
    create({ path, body: { channelType: channel.entityType, channelId: channel.id, installationId: tab.id, title: tab.name, audience } });
  };

  const confirmOn = (trigger: HTMLElement) =>
    openConfirm(trigger, {
      id: `switch-on-lti-tab-${tab.id}`,
      title: (
        <NamedText
          i18nKey={tab.readsMembers ? 'c:confirm.add_lti_tab' : 'c:confirm.add_lti_tab_for'}
          name={tab.name}
          values={{ channel: channel.name }}
        />
      ),
      content: <LtiAudienceChoice channel={channel} current={link?.audience} onChoose={switchOn} />,
    });

  const onCheckedChange = (checked: boolean) => {
    if (!checked) return switchOff();
    if (switchRef.current) confirmOn(switchRef.current);
  };

  const on = switching ? !!variables?.body.enabled : placing || !!link?.enabled;
  const refused = !on && !!tab.refusal;

  return (
    <Switch
      ref={switchRef}
      aria-label={`${row.name}: ${t('c:visible')}`}
      tabIndex={tabIndex}
      checked={on}
      disabled={placing || switching || refused}
      onCheckedChange={onCheckedChange}
    />
  );
}
