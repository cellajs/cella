import { LockIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { ChannelSlot } from 'shared/placements';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { arrangePlacements, dataTabOrder, keepUnshownIds } from '~/lib/placements';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import { RowDragPreview } from '~/modules/common/data-table/row-drag-preview';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HelpText } from '~/modules/common/help-text';
import { getNavTabCandidates, hostsDataTabs } from '~/modules/common/page/tab-nav';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { LtiTabOrigin, LtiTabRefusal, type LtiTabRow, LtiTabSwitch, useLtiTabRows } from '~/modules/lti-platform/lti-tab-rows';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface TabRow {
  id: string;
  /** Translated, so module-scope renderers can use it. */
  name: string;
  /** Translated; absent when the tab declares none. */
  description?: string;
  order: number;
  locked?: boolean;
  visible: boolean;
  /** An LTI tool's tab: its switch places it and switches it on and off, and the channel's hidden ids never name it. */
  lti?: LtiTabRow;
}

/** An LTI tool never placed in the channel: its row lists after the others and takes no place in the stored order. */
const isUnplaced = (row: TabRow) => !!row.lti && !row.lti.tab.resourceLink;

// Content stays on the row's first line, so nothing shifts while a description unfolds
const firstLineCellClass = tw('grid grid-rows-(--rdg-row-height) content-start justify-center');

const renderRowDragPreview = (row: TabRow) => <RowDragPreview name={row.name} />;

interface TabsArrangementCardProps {
  entity: EnrichedChannel & { toolsConfig: ToolsConfig };
  /** Layout route whose tabs it arranges: its `navTab` child routes plus the tools of its `tabsSlot`. */
  parentRouteId: string;
  onPersist: (toolsConfig: ToolsConfig) => void;
}

/**
 * Orders and hides a channel's tabs in `toolsConfig['<channelType>.tabs']`, listed ungated so the viewer's grants hide
 * none, and places and switches the tabs of the tenant's LTI tools among them; UI only, never authorization.
 */
export function TabsArrangementCard(props: TabsArrangementCardProps) {
  // A layout without a `$tool` route shows no LTI tab, so its card places none
  const placesLtiTabs = appConfig.has.ltiPlatform && hostsDataTabs(props.parentRouteId);
  // Without LTI rows the card cannot tell a stored LTI tab id from a stale one: a write keeps them all
  return placesLtiTabs ? <LtiTabsArrangement {...props} /> : <TabsArrangement {...props} lti={{ rows: [], read: false }} />;
}

function LtiTabsArrangement(props: TabsArrangementCardProps) {
  const { t } = useTranslation();
  const { rows, query } = useLtiTabRows(props.entity);
  return (
    <TabsArrangement {...props} lti={{ rows, read: query.isSuccess }}>
      {query.isError && (
        <p className="text-muted-foreground mt-3 flex items-center gap-2 text-sm">
          {t('c:lti_tabs.failed')}
          <Button variant="ghost" size="sm" loading={query.isFetching} onClick={() => query.refetch()}>
            {t('c:try_again')}
          </Button>
        </p>
      )}
    </TabsArrangement>
  );
}

interface TabsArrangementProps extends TabsArrangementCardProps {
  /** The LTI tools' rows, and whether they were read: until then, a write keeps the stored ids the card does not show. */
  lti: { rows: LtiTabRow[]; read: boolean };
  children?: ReactNode;
}

function TabsArrangement({ entity, parentRouteId, onPersist, lti, children }: TabsArrangementProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const slot: ChannelSlot = `${entity.entityType}.tabs`;
  const slotConfig = entity.toolsConfig[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);

  // Draft order applied at drop time so the reorder does not wait on the mutation round-trip. A new persisted order drops it.
  const persistedOrderKey = (slotConfig?.order ?? []).join();
  const [draft, setDraft] = useState<{ order: string[]; persistedOrderKey: string } | null>(null);
  const draftOrder = draft?.persistedOrderKey === persistedOrderKey ? draft.order : null;

  const declaredRows: TabRow[] = getNavTabCandidates(parentRouteId).map((tab) => {
    const resource = tab.resource ? t(tab.resource) : '';
    return {
      ...tab,
      name: t(tab.label, { resource }),
      description: tab.description ? t(tab.description, { resource }) : undefined,
      visible: !hidden.has(tab.id),
    };
  });
  const ltiTabRows: TabRow[] = lti.rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: dataTabOrder,
    visible: !!row.tab.resourceLink?.enabled,
    lti: row,
  }));
  const arranged = arrangePlacements(slot, [...declaredRows, ...ltiTabRows], draftOrder ? { order: draftOrder } : slotConfig);
  const rows = [...arranged.filter((row) => !isUnplaced(row)), ...arranged.filter(isUnplaced)];
  const movable = rows.filter((row) => !isUnplaced(row)).length;

  const persistSlot = (nextConfig: SlotToolsConfig) => onPersist({ [slot]: nextConfig });

  // The ids a write stores: never an LTI tool's that is not placed, unless `placing` it now
  const orderOf = (ids: string[], placing?: string) => {
    const stored = ids.filter((id) => id === placing || !rows.some((row) => row.id === id && isUnplaced(row)));
    return lti.read ? stored : keepUnshownIds(slotConfig?.order ?? [], stored);
  };

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = rows.filter((row) => !row.lti && (row.id === id ? !visible : !row.visible)).map((row) => row.id);
    persistSlot({ order: orderOf(rows.map((row) => row.id)), hidden: nextHidden });
  };

  const reorder = (ids: string[], placing?: string) => {
    const order = orderOf(ids, placing);
    setDraft({ order, persistedOrderKey });
    persistSlot({ order, hidden: [...hidden] });
  };

  // A tab placed for the first time takes the place its row has; one placed before keeps its own
  const keepPlace = (id: string) => {
    if (!slotConfig?.order?.includes(id))
      reorder(
        rows.map((row) => row.id),
        id,
      );
  };

  const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
    if (fromIdx >= movable) return;
    const ids = rows.map((row) => row.id);
    const [moved] = ids.splice(fromIdx, 1);
    let insertAt = edge === 'bottom' ? toIdx + 1 : toIdx;
    if (fromIdx < insertAt) insertAt -= 1;
    ids.splice(Math.min(insertAt, movable - 1), 0, moved);
    reorder(ids);
  };

  // The same reorder one place at a time, from the grip's arrow keys or its menu
  const moveRow = (fromIdx: number, step: -1 | 1) => {
    if (fromIdx + step >= movable) return;
    const ids = rows.map((row) => row.id);
    [ids[fromIdx], ids[fromIdx + step]] = [ids[fromIdx + step], ids[fromIdx]];
    reorder(ids);
  };

  const columns: ColumnOrColumnGroup<TabRow>[] = [
    // A single tab has no order to change
    ...(movable > 1
      ? [
          reorderColumn<TabRow>({
            getId: rowKeyById,
            getName: (row) => row.name,
            onMove: moveRow,
            rowCount: movable,
            hasGrip: (row) => !isUnplaced(row),
            cellClass: firstLineCellClass,
          }),
        ]
      : []),
    {
      key: 'label',
      name: t('c:resource_name', { resource: t('c:tab') }),
      minWidth: isMobile ? 132 : 160,
      // Rows take their height from this cell, so a description wraps where a fixed row would truncate it
      wrapText: true,
      // 1.5rem is the help toggle's height: the name stays where a centred row has it as the description unfolds
      cellClass: (row) =>
        cn('flex-col items-stretch justify-center py-2', row.description && 'justify-start pt-[calc((var(--rdg-row-height)-1.5rem)/2)] pb-3'),
      renderCell: ({ row, tabIndex }) => {
        const name = <span className="text-sm leading-tight font-medium">{row.name}</span>;
        if (row.lti) {
          return (
            <>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                {name}
                <LtiTabOrigin row={row.lti} />
              </span>
              <LtiTabRefusal row={row.lti} channel={entity} />
            </>
          );
        }
        if (!row.description) return name;
        return (
          <HelpText content={<p className="pt-1">{row.description}</p>} tabIndex={tabIndex}>
            {name}
          </HelpText>
        );
      },
    },
    {
      key: 'visible',
      name: t('c:visible'),
      width: 64,
      cellClass: firstLineCellClass,
      headerCellClass: 'justify-center',
      renderCell: ({ row, tabIndex }) =>
        row.lti ? (
          <LtiTabSwitch channel={entity} row={row.lti} tabIndex={tabIndex} onToggle={() => keepPlace(row.id)} />
        ) : row.locked ? (
          <LockIcon className="size-3.5 opacity-50" aria-label={t('c:locked')} />
        ) : (
          <Switch
            aria-label={`${row.name}: ${t('c:visible')}`}
            tabIndex={tabIndex}
            checked={row.visible}
            onCheckedChange={(visible) => toggleHidden(row.id, visible)}
          />
        ),
    },
  ];

  return (
    <ToolCard label="c:tabs" description={t('c:tabs.text')}>
      <DataTable
        {...{ rows, columns, onRowReorder, renderRowDragPreview }}
        rowKeyGetter={rowKeyById}
        rowHeight={56}
        hasNextPage={false}
        hideEndMarker
        enableVirtualization={false}
      />
      {children}
    </ToolCard>
  );
}
