import { useNavigate } from '@tanstack/react-router';
import { BlocksIcon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LtiResourceLink } from 'sdk';
import { appConfig } from 'shared';
import { ltiTabId } from 'shared/tools-config';
import { DropdownActionGroup, DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { focusPageTab, resolveChannelTabs } from '~/modules/common/page/tab-nav';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';
import { LtiTabOrigin, type LtiTabRow, useLtiTabOn, useLtiTabRows } from '~/modules/lti-platform/lti-tab-rows';
import { ltiResourceLinksQueryOptions } from '~/modules/lti-platform/query';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';
import { getChannelRouteParams } from '~/utils/channel-route';

/** Its tab is not on here, and nothing keeps it from being switched on. */
const isOffered = ({ tab }: LtiTabRow) => !tab.resourceLink?.enabled && !tab.refusal;

/** Each LTI tool offered turns the menu into the confirmation that switches its tab on; the page then opens the tab. */
function AddLtiTabMenu({ channel }: { channel: EnrichedChannel }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rows } = useLtiTabRows(channel);
  const { confirmTabOn } = useLtiTabOn(channel);

  const openTab = async (link: LtiResourceLink) => {
    const id = ltiTabId(link.installationId);
    const dataTabs = [{ id, title: link.title }];
    const tab = resolveChannelTabs(channel.entityType, getChannelRouteParams(channel), { dataTabs }).find((candidate) => candidate.id === id);
    if (!tab) return;
    // The bar holds the tab's link, which takes the focus, once the tabs are read again
    await queryClient.query(ltiResourceLinksQueryOptions(channel)).catch(() => {});
    await navigate({ to: tab.path, params: tab.params });
    focusPageTab(id);
  };

  return (
    <DropdownActionGroup label={t('c:add_lti_tab.text', { resource: t(`c:${channel.entityType}`) })}>
      {rows.filter(isOffered).map((row) => (
        <DropdownActionItem key={row.id} icon={BlocksIcon} className="h-auto min-h-11" confirm={confirmTabOn(row, openTab)}>
          <span className="flex min-w-0 flex-col text-left whitespace-normal">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              {row.name}
              <LtiTabOrigin row={row} />
            </span>
            {row.tab.description && <span className="text-muted-foreground line-clamp-2 text-xs">{row.tab.description}</span>}
          </span>
        </DropdownActionItem>
      ))}
    </DropdownActionGroup>
  );
}

function AddLtiTabButton({ channel }: { channel: EnrichedChannel }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { rows } = useLtiTabRows(channel);
  if (!rows.some(isOffered)) return null;

  const id = `add-lti-tab-${channel.id}`;
  const open = () =>
    dropdowner
      .getState()
      .create(<AddLtiTabMenu channel={channel} />, { id, triggerId: id, triggerRef, align: 'end', kind: 'menu', popupClassName: 'w-80' });

  return (
    <Button ref={triggerRef} soft size="xs" aria-label={t('c:add_resource', { resource: t('c:tab') })} className="max-sm:size-8" onClick={open}>
      <PlusIcon />
      <span className="max-sm:sr-only">{t('c:add')}</span>
    </Button>
  );
}

/** Ends a channel's tab bar for whoever may switch an LTI tool's tab on there, while an LTI tool they may switch on has none on. */
export function AddLtiTab({ channel }: { channel: EnrichedChannel }) {
  const can = useCan();
  if (!appConfig.has.ltiPlatform || !can('update', channel.entityType, channel)) return null;
  return <AddLtiTabButton channel={channel} />;
}
