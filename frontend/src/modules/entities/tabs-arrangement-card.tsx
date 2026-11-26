import { LockIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType } from 'shared';
import { type SlotToolsConfig, stackSlotConfigs, type ToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { type ArrangedChannel, arrangePlacements, dataTabOrder, keepUnshownIds } from '~/lib/placements';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import { RowDragPreview } from '~/modules/common/data-table/row-drag-preview';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HelpText } from '~/modules/common/help-text';
import { getNavTabCandidates, getTabsRouteId, hostsDataTabs } from '~/modules/common/page/tab-nav';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import {
  LtiTabAudience,
  LtiTabOrigin,
  LtiTabReads,
  LtiTabRefusal,
  type LtiTabRow,
  LtiTabSwitch,
  useLtiTabRows,
} from '~/modules/lti-platform/lti-tab-rows';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
import { invalidateChannelsInside } from '~/query/realtime/membership-ops';
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
  /** Switched on: a declared tab by the row's own hidden ids, an LTI tool's tab by its resource link. */
  visible: boolean;
  /** A declared tab a channel above hides: it stays off and its switch is disabled, whatever the row's own ids say. */
  hiddenAbove?: boolean;
  /** An LTI tool's tab: its switch places it and switches it on and off, and the channel's hidden ids never name it. */
  lti?: LtiTabRow;
}

type ChannelTabsSlot = `${ChannelEntityType}.tabs`;

/** An LTI tool never placed in the channel: its row lists after the others and takes no place in the stored order. */
const isUnplaced = (row: TabRow) => !!row.lti && !row.lti.tab.resourceLink;

// Content stays on the row's first line, so nothing shifts while a description unfolds
const firstLineCellClass = tw('grid grid-rows-(--rdg-row-height) content-start justify-center');

const renderRowDragPreview = (row: TabRow) => <RowDragPreview name={row.name} />;

interface TabsArrangementCardProps {
  entity: EnrichedChannel & ArrangedChannel & { toolsConfig: ToolsConfig };
  /**
   * The tabs slot it arranges, the entity's own by default: the tabs of the layout route that declares it as `tabsSlot`.
   * A slot of a channel type below the entity arranges the tabs of every row of that type inside it.
   */
  slot?: ChannelTabsSlot;
  /** Writes the arrangement and returns the write's promise, such as a `mutateAsync`, which reports its own failure. */
  onPersist: (toolsConfig: ToolsConfig) => Promise<unknown>;
}

interface ResolvedCardProps extends Omit<TabsArrangementCardProps, 'slot'> {
  slot: ChannelTabsSlot;
  /** The layout route whose `navTab` child routes and `tabsSlot` tools are the slot's tabs. */
  routeId: string;
}

/**
 * Orders and hides the tabs of a channel's slot in its `toolsConfig`, listed ungated so the viewer's grants hide none,
 * and in its own slot places and switches the tabs of the tenant's LTI tools among them; UI only, never authorization.
 * A tab a channel above hides shows off, and the card stores only the row's own hidden ids.
 */
export function TabsArrangementCard(props: TabsArrangementCardProps) {
  const slot = props.slot ?? `${props.entity.entityType}.tabs`;
  const routeId = getTabsRouteId(slot) ?? '';
  // The card places LTI tabs only on a layout with a `$tool` route, and only in its own slot: a row below places its own
  const placesLtiTabs = appConfig.has.ltiPlatform && slot === `${props.entity.entityType}.tabs` && hostsDataTabs(routeId);
  // Without LTI rows the card cannot tell a stored LTI tab id from a stale one: a write keeps them all
  return placesLtiTabs ? (
    <LtiTabsArrangement {...props} slot={slot} routeId={routeId} />
  ) : (
    <TabsArrangement {...props} slot={slot} routeId={routeId} lti={{ rows: [], read: false }} />
  );
}

function LtiTabsArrangement(props: ResolvedCardProps) {
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

interface TabsArrangementProps extends ResolvedCardProps {
  /** The LTI tools' rows, and whether they were read: until then, a write keeps the stored ids the card does not show. */
  lti: { rows: LtiTabRow[]; read: boolean };
  children?: ReactNode;
}

function TabsArrangement({ entity, slot, routeId, onPersist, lti, children }: TabsArrangementProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');
  const hiddenAboveIdPrefix = useId();

  // A slot of a type below the entity, such as an organization's arrangement of every project's tabs
  const typeBelow = slot === `${entity.entityType}.tabs` ? undefined : appConfig.channelEntityTypes.find((type) => slot === `${type}.tabs`);
  const slotConfig = entity.toolsConfig[slot];
  const inherited = entity.included?.inheritedToolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);
  const hiddenAboveIds = new Set(inherited?.hidden ?? []);

  // Draft order applied at drop time so the reorder does not wait on the mutation round-trip. A new persisted order drops it.
  const persistedOrderKey = (slotConfig?.order ?? []).join();
  const [draft, setDraft] = useState<{ order: string[]; persistedOrderKey: string } | null>(null);
  const draftOrder = draft?.persistedOrderKey === persistedOrderKey ? draft.order : null;

  const declaredRows: TabRow[] = getNavTabCandidates(routeId).map((tab) => {
    const resource = tab.resource ? t(tab.resource) : '';
    return {
      ...tab,
      name: t(tab.label, { resource }),
      description: tab.description ? t(tab.description, { resource }) : undefined,
      visible: !hidden.has(tab.id),
      hiddenAbove: !tab.locked && hiddenAboveIds.has(tab.id),
    };
  });
  const ltiTabRows: TabRow[] = lti.rows.map((row) => ({
    id: row.id,
    name: row.name,
    order: dataTabOrder,
    visible: !!row.tab.resourceLink?.enabled,
    lti: row,
  }));
  const arranged = arrangePlacements(
    slot,
    [...declaredRows, ...ltiTabRows],
    stackSlotConfigs(inherited, draftOrder ? { order: draftOrder } : slotConfig),
  );
  const rows = [...arranged.filter((row) => !isUnplaced(row)), ...arranged.filter(isUnplaced)];
  const movable = rows.filter((row) => !isUnplaced(row)).length;

  // The rows below read the entity's arrangement through their own `included`. The write reports its own failure.
  const persistSlot = (nextConfig: SlotToolsConfig) =>
    onPersist({ [slot]: nextConfig }).then(
      () => {
        if (typeBelow) invalidateChannelsInside(entity.id);
      },
      () => {},
    );

  const hiddenAboveId = (row: TabRow) => `${hiddenAboveIdPrefix}-${row.id}`;

  // The ids a write stores: never an LTI tool's that is not placed
  const orderOf = (ids: string[]) => {
    const stored = ids.filter((id) => !rows.some((row) => row.id === id && isUnplaced(row)));
    return lti.read ? stored : keepUnshownIds(slotConfig?.order ?? [], stored);
  };

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = rows.filter((row) => !row.lti && (row.id === id ? !visible : !row.visible)).map((row) => row.id);
    persistSlot({ order: orderOf(rows.map((row) => row.id)), hidden: nextHidden });
  };

  const reorder = (ids: string[]) => {
    const order = orderOf(ids);
    setDraft({ order, persistedOrderKey });
    persistSlot({ order, hidden: [...hidden] });
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
              <LtiTabAudience channel={entity} row={row.lti} tabIndex={tabIndex} />
              <LtiTabReads row={row.lti} channel={entity} />
              <LtiTabRefusal row={row.lti} channel={entity} />
            </>
          );
        }
        return (
          <>
            {row.description ? (
              <HelpText content={<p className="pt-1">{row.description}</p>} tabIndex={tabIndex}>
                {name}
              </HelpText>
            ) : (
              name
            )}
            {row.hiddenAbove && (
              <span id={hiddenAboveId(row)} className="text-muted-foreground text-xs leading-tight">
                {t('c:hidden_above.text')}
              </span>
            )}
          </>
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
          <LtiTabSwitch channel={entity} row={row.lti} tabIndex={tabIndex} />
        ) : row.locked ? (
          <LockIcon className="size-3.5 opacity-50" aria-label={t('c:locked')} />
        ) : (
          <Switch
            aria-label={`${row.name}: ${t('c:visible')}`}
            aria-describedby={row.hiddenAbove ? hiddenAboveId(row) : undefined}
            tabIndex={tabIndex}
            checked={row.visible && !row.hiddenAbove}
            disabled={row.hiddenAbove}
            onCheckedChange={(visible) => toggleHidden(row.id, visible)}
          />
        ),
    },
  ];

  return (
    <ToolCard
      label={typeBelow ? 'c:resource_tabs' : 'c:tabs'}
      resource={typeBelow && `c:${typeBelow}`}
      description={typeBelow ? t('c:resource_tabs.text', { resource: t(`c:${typeBelow}`) }) : t('c:tabs.text')}
    >
      <DataTable
        {...{ rows, columns, onRowReorder, renderRowDragPreview }}
        rowKeyGetter={rowKeyById}
        rowHeight={56}
        hasNextPage={false}
        hideEndMarker
        enableVirtualization={false}
        enableStickyHeader={false}
      />
      {children}
    </ToolCard>
  );
}
