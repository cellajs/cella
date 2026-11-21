import { useRouter } from '@tanstack/react-router';
import { BlocksIcon, PlusIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LtiResourceLink } from 'sdk';
import { appConfig } from 'shared';
import { ltiTabId } from 'shared/tools-config';
import { DropdownActionGroup, DropdownActionItem } from '~/modules/common/dropdowner/dropdown-action-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { resolveChannelTabs } from '~/modules/common/page/tab-nav';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useCan } from '~/modules/entities/use-can';
import { LtiTabOrigin, type LtiTabRow, useLtiTabOn, useLtiTabRows } from '~/modules/lti-platform/lti-tab-rows';
import { ltiResourceLinksQueryOptions } from '~/modules/lti-platform/query';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';
import { getChannelRouteParams } from '~/utils/channel-route';

/** Its tab is not on here, and nothing keeps it from being switched on. */
const isOffered = ({ tab }: LtiTabRow) => !tab.resourceLink?.enabled && !tab.refusal;

interface AddLtiTabMenuProps {
  channel: EnrichedChannel;
  rows: LtiTabRow[];
  confirm: (row: LtiTabRow) => { title: ReactNode; content: ReactNode };
}

/** Each LTI tool offered turns the menu into the confirmation that switches its tab on. */
function AddLtiTabMenu({ channel, rows, confirm }: AddLtiTabMenuProps) {
  const { t } = useTranslation();
  return (
    <DropdownActionGroup label={t('c:add_lti_tab.text', { resource: t(`c:${channel.entityType}`) })}>
      {rows.map((row) => (
        <DropdownActionItem key={row.id} icon={BlocksIcon} className="h-auto min-h-11" confirm={confirm(row)}>
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
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { rows } = useLtiTabRows(channel);
  const { confirmTabOn, isTurningOn } = useLtiTabOn(channel);
  const offered = rows.filter((row) => isOffered(row) && !isTurningOn(row));
  if (!offered.length) return null;

  // Opens the tab only while the person stays on `pathname` and their own tabs hold it: an audience they are outside of leaves it out
  const openTab = async (link: LtiResourceLink, pathname: string) => {
    const opens = await queryClient.query(ltiResourceLinksQueryOptions(channel)).then(
      ({ results }) => results.some(({ id }) => id === link.id),
      () => false,
    );
    if (!opens || router.state.location.pathname !== pathname) return;
    const id = ltiTabId(link.installationId);
    const dataTabs = [{ id, title: link.title }];
    const tab = resolveChannelTabs(channel.entityType, getChannelRouteParams(channel), { dataTabs }).find((candidate) => candidate.id === id);
    if (tab) router.navigate({ to: tab.path, params: tab.params, state: { focusTab: id } });
  };

  const id = `add-lti-tab-${channel.id}`;
  const open = () => {
    const { pathname } = router.state.location;
    const confirm = (row: LtiTabRow) => confirmTabOn(row, (link) => openTab(link, pathname));
    const menu = <AddLtiTabMenu channel={channel} rows={offered} confirm={confirm} />;
    dropdowner.getState().create(menu, { id, triggerId: id, triggerRef, align: 'end', kind: 'menu', popupClassName: 'w-80' });
  };

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
