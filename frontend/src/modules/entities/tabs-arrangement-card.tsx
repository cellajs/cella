import { LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelSlot } from 'shared/placements';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { arrangePlacements } from '~/lib/placements';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { reorderColumn } from '~/modules/common/data-table/reorder-column';
import { RowDragPreview } from '~/modules/common/data-table/row-drag-preview';
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

// The label cell stacks a tab's name and description, centred in the row
const labelCellClass = tw('flex-col items-stretch justify-center py-2');
// The top padding seats the name where a centred row has it (1.5rem: the help toggle's height) as the description unfolds
const helpLabelCellClass = tw('justify-start pt-[calc((var(--rdg-row-height)-1.5rem)/2)] pb-3');
// The other cells keep their content on the row's first line, so nothing shifts while a description unfolds, and still fill the row
const firstLineCellClass = tw('grid grid-rows-(--rdg-row-height) content-start justify-center');

function renderRowDragPreview(row: TabRow) {
  return <RowDragPreview name={row.name} />;
}

interface TabsArrangementCardProps {
  entity: EnrichedChannel & { toolsConfig?: ToolsConfig };
  /** Layout route whose tabs it arranges: its `navTab` child routes plus the tools of its `tabsSlot`. */
  parentRouteId: string;
  /** Persists the next toolsConfig through the channel's update mutation. */
  onPersist: (toolsConfig: ToolsConfig) => void;
}

/** Orders and hides a channel's tabs in `toolsConfig['<channelType>.tabs']`, listed ungated so the viewer's grants hide none; UI only, never authorization. */
export function TabsArrangementCard({ entity, parentRouteId, onPersist }: TabsArrangementCardProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm');

  const slot: ChannelSlot = `${entity.entityType}.tabs`;
  const slotConfig = entity.toolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);

  // Draft order applied at drop time so the reorder does not wait on the mutation round-trip
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const persistedOrderKey = (slotConfig?.order ?? []).join();
  useEffect(() => setDraftOrder(null), [persistedOrderKey]);

  const rows = arrangePlacements(slot, getNavTabCandidates(parentRouteId), draftOrder ? { order: draftOrder } : slotConfig).map((tab) => {
    const resource = tab.resource ? t(tab.resource) : '';
    return {
      ...tab,
      name: t(tab.label, { resource }),
      description: tab.description ? t(tab.description, { resource }) : undefined,
      visible: !hidden.has(tab.id),
    };
  });

  const persistSlot = (nextConfig: SlotToolsConfig) => onPersist({ [slot]: nextConfig });

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

  // The same reorder one place at a time, from the grip's arrow keys or its menu
  const moveRow = (fromIdx: number, step: -1 | 1) => {
    const ids = rows.map((row) => row.id);
    [ids[fromIdx], ids[fromIdx + step]] = [ids[fromIdx + step], ids[fromIdx]];
    reorder(ids);
  };

  const columns: ColumnOrColumnGroup<TabRow>[] = [
    // A single tab has no order to change
    ...(rows.length > 1
      ? [
          reorderColumn<TabRow>({
            getId: rowKeyById,
            getName: (row) => row.name,
            onMove: moveRow,
            rowCount: rows.length,
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
      cellClass: (row) => cn(labelCellClass, row.description && helpLabelCellClass),
      renderCell: ({ row, tabIndex }) => {
        const name = <span className="font-medium text-sm leading-tight">{row.name}</span>;
        if (!row.description) return name;
        return (
          <HelpText content={<p className="text-xs">{row.description}</p>} tabIndex={tabIndex}>
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
        row.locked ? (
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
        rows={rows}
        rowKeyGetter={rowKeyById}
        rowHeight={56}
        columns={columns}
        hasNextPage={false}
        hideEndMarker
        enableVirtualization={false}
        onRowReorder={onRowReorder}
        renderRowDragPreview={renderRowDragPreview}
      />
    </ToolCard>
  );
}
