import { LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelSlot } from 'shared/placements';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { orderBySlotConfig } from '~/lib/placements';
import { DataTable } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HelpText } from '~/modules/common/help-text';
import { getNavTabCandidates } from '~/modules/common/page/tab-nav';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Switch } from '~/modules/ui/switch';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface TabRow {
  id: string;
  label: TKey;
  resource?: TKey;
  /** Pre-translated label, resolved once per render so module-scope renderers can use it. */
  name: string;
  /** Pre-translated single-sentence explanation of the tab's content, absent when the tab declares none. */
  description?: string;
  order: number;
  locked?: boolean;
  visible: boolean;
}

// Module scope keeps DataGrid's prop identity stable across renders
function rowKeyGetter(row: TabRow) {
  return row.id;
}

// The label cell stacks a tab's name and description, centred in the row
const labelCellClass = tw('flex-col items-stretch justify-center py-2');
// Below `sm` a row grows as its description unfolds. The top padding seats the name where a centred row has it (1.5rem is
// the help toggle's height), and the other cells keep to the row's first line, so nothing shifts while the text opens beneath
const helpLabelCellClass = tw('max-sm:justify-start max-sm:pt-[calc((var(--rdg-row-height)-1.5rem)/2)] max-sm:pb-3');
const firstLineCellClass = tw('max-sm:h-(--rdg-row-height) max-sm:self-start');

function renderRowDragPreview(row: TabRow) {
  return <div className="rounded border bg-background px-2 py-1 text-sm shadow-md">{row.name}</div>;
}

interface TabsArrangementCardProps {
  entity: EnrichedChannel & { toolsConfig?: ToolsConfig };
  /** The tabbed surface whose candidates are managed (route navTabs plus registry slot tools). */
  parentRouteId: string;
  /** Persists the next toolsConfig through the channel's update mutation. */
  persist: (toolsConfig: ToolsConfig) => void;
}

/**
 * Arranges a channel surface's tabs, persisted in `toolsConfig['<channelType>.tabs']`. Candidates
 * list ungated, so tabs the viewer's own grants would hide stay manageable; `locked` tabs cannot be
 * hidden. UI visibility only, never authorization.
 */
export function TabsArrangementCard({ entity, parentRouteId, persist }: TabsArrangementCardProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const slot = `${entity.entityType}.tabs` as ChannelSlot;
  const slotConfig = entity.toolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);

  // Draft order applied at drop time so the reorder does not wait on the mutation round-trip
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const persistedOrderKey = (slotConfig?.order ?? []).join();
  useEffect(() => setDraftOrder(null), [persistedOrderKey]);

  const candidates = getNavTabCandidates(parentRouteId).map(({ id, label, resource, description, order, locked }) => ({
    id,
    label,
    resource,
    description,
    order,
    locked,
  }));
  const rows = orderBySlotConfig(candidates, draftOrder ? { order: draftOrder } : slotConfig).map((tab) => ({
    ...tab,
    name: t(tab.label, { resource: tab.resource ? t(tab.resource).toLowerCase() : '' }),
    description: tab.description ? t(tab.description, { resource: tab.resource ? t(tab.resource).toLowerCase() : '' }) : undefined,
    visible: !hidden.has(tab.id),
  }));

  const persistSlot = (nextConfig: SlotToolsConfig) => persist({ [slot]: nextConfig });

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = rows.filter((row) => (row.id === id ? !visible : !row.visible)).map((row) => row.id);
    persistSlot({ order: rows.map((row) => row.id), hidden: nextHidden });
  };

  const reorder = (ids: string[]) => {
    setDraftOrder(ids);
    persistSlot({ order: ids, hidden: [...hidden] });
  };

  const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
    const ids = rows.map((row) => row.id);
    const [moved] = ids.splice(fromIdx, 1);
    let insertAt = edge === 'bottom' ? toIdx + 1 : toIdx;
    if (fromIdx < insertAt) insertAt -= 1;
    ids.splice(insertAt, 0, moved);
    reorder(ids);
  };

  // The same reorder one step at a time, from the grip's menu, for the keyboard and for a pointer that cannot drag
  const [moveStatus, setMoveStatus] = useState('');
  const moveRow = (fromIdx: number, step: -1 | 1) => {
    const toIdx = fromIdx + step;
    if (toIdx < 0 || toIdx >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[fromIdx], ids[toIdx]] = [ids[toIdx], ids[fromIdx]];
    reorder(ids);
    setMoveStatus(t('c:success.move_position', { name: rows[fromIdx].name, position: toIdx + 1, total: rows.length }));
  };

  const columns: ColumnOrColumnGroup<TabRow>[] = [
    // A single tab has no order to change, so its grip would open a menu of two dead items
    ...(rows.length > 1
      ? [reorderColumn<TabRow>({ getName: (row) => row.name, onMove: moveRow, rowCount: rows.length, cellClass: firstLineCellClass })]
      : []),
    {
      key: 'label',
      name: t('c:resource_name', { resource: t('c:tab') }),
      minWidth: isMobile ? 132 : 160,
      // Rows take their height from this cell, so a description wraps where a fixed row would truncate it
      wrapText: true,
      cellClass: (row) => cn(labelCellClass, row.description && helpLabelCellClass),
      renderCell: ({ row }) => {
        const name = <span className="text-sm leading-tight">{row.name}</span>;
        if (!row.description) return name;

        // A narrow column wraps a description over many lines, so there it unfolds from a help toggle
        if (isMobile) {
          return (
            <HelpText className="mb-0" content={<p className="text-xs">{row.description}</p>}>
              {name}
            </HelpText>
          );
        }

        return (
          <>
            {name}
            <span className="text-muted-foreground text-xs">{row.description}</span>
          </>
        );
      },
    },
    {
      key: 'visible',
      name: t('c:visible'),
      width: 64,
      cellClass: cn('flex items-center justify-center', firstLineCellClass),
      headerCellClass: 'text-center',
      renderCell: ({ row }) =>
        row.locked ? (
          <LockIcon className="size-3.5 opacity-50" aria-label={t('c:locked')} />
        ) : (
          <Switch aria-label={`${row.name}: ${t('c:visible')}`} checked={row.visible} onCheckedChange={(visible) => toggleHidden(row.id, visible)} />
        ),
    },
  ];

  return (
    <ToolCard label="c:tabs" description={t('c:tabs.text', { resource: t(`c:${entity.entityType}`).toLowerCase() })}>
      <DataTable
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        rowHeight={56}
        columns={columns}
        hasNextPage={false}
        readOnly
        enableVirtualization={false}
        onRowReorder={onRowReorder}
        renderRowDragPreview={renderRowDragPreview}
      />
      <span className="sr-only" role="status">
        {moveStatus}
      </span>
    </ToolCard>
  );
}
