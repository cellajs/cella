import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListLtiTabsResponse } from 'sdk';
import { ltiTabId } from 'shared/tools-config';
import { ConfirmForm } from '~/modules/common/confirm-form';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { NamedText } from '~/modules/common/named-text';
import { openConfirm } from '~/modules/common/open-confirm';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { LtiToolOrigin, sharesNameAmong } from '~/modules/lti-platform/lti-tool-origin';
import { ltiTabsQueryOptions, useCreateLtiResourceLinkMutation, useUpdateLtiResourceLinkMutation } from '~/modules/lti-platform/query';
import { Switch } from '~/modules/ui/switch';

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

/** Why the row's tab cannot be switched on: a disabled LTI tool. */
export function LtiTabRefusal({ row }: { row: LtiTabRow }) {
  const { t } = useTranslation();
  if (!row.tab.refusal) return null;
  return <span className="text-muted-foreground text-xs leading-tight">{t('c:lti_tab_tool_disabled.text')}</span>;
}

interface LtiTabSwitchProps {
  channel: EnrichedChannel;
  row: LtiTabRow;
  tabIndex: number;
  /** Right before the tab is placed or switched. */
  onToggle: () => void;
}

/** Switches an LTI tool's tab on and off, keeping its resource link; switching on one that reads course members asks first. */
export function LtiTabSwitch({ channel, row, tabIndex, onToggle }: LtiTabSwitchProps) {
  const { t } = useTranslation();
  const switchRef = useRef<HTMLElement>(null);
  const { mutate: create, isPending: placing } = useCreateLtiResourceLinkMutation();
  const { mutate: update, isPending: switching, variables } = useUpdateLtiResourceLinkMutation();
  const path = { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) };
  const { tab } = row;
  const link = tab.resourceLink;

  const setEnabled = (enabled: boolean) => {
    onToggle();
    if (link) return update({ path: { ...path, ltiResourceLinkId: link.id }, body: { enabled } });
    create({ path, body: { channelType: channel.entityType, channelId: channel.id, installationId: tab.id, title: tab.name } });
  };

  const confirmOn = (trigger: HTMLElement) =>
    openConfirm(trigger, {
      id: `switch-on-lti-tab-${tab.id}`,
      title: <NamedText i18nKey="c:confirm.add_lti_tab" name={tab.name} values={{ course: channel.name }} />,
      content: (
        <ConfirmForm
          label={t('c:add_resource', { resource: t('c:tab') })}
          icon={PlusIcon}
          pending={false}
          onConfirm={() => {
            dropdowner.getState().remove();
            setEnabled(true);
          }}
        />
      ),
    });

  const onCheckedChange = (checked: boolean) => {
    if (!checked) return setEnabled(false);
    // The person sees whose people the LTI tool reads before it does, or nothing happens
    if (tab.readsMembers) {
      if (switchRef.current) confirmOn(switchRef.current);
      return;
    }
    setEnabled(true);
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
