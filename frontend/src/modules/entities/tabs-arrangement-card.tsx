import { GripVerticalIcon, LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import type { TKey } from '~/lib/i18n-locales';
import { orderBySlotConfig } from '~/lib/placements';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { getNavTabCandidates } from '~/modules/common/page/tab-nav';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Switch } from '~/modules/ui/switch';

/** One manageable tab: descriptor fields plus its current visibility on this channel. */
interface TabRow {
  id: string;
  label: TKey;
  resource?: TKey;
  /** Pre-translated label, resolved once per render so module-scope renderers can use it. */
  name: string;
  order: number;
  locked?: boolean;
  visible: boolean;
}

/** Stable row key getter, defined outside the component to keep its identity stable. */
function rowKeyGetter(row: TabRow) {
  return row.id;
}

/** Stable drag preview renderer, defined at module scope so DataGrid's prop identity stays stable. */
function renderRowDragPreview(row: TabRow) {
  return <div className="rounded border bg-background px-2 py-1 text-sm shadow-md">{row.name}</div>;
}

interface TabsArrangementCardProps {
  /** The hosting channel entity; the tabs slot and stored arrangement derive from it. */
  entity: EnrichedChannel & { toolsConfig?: ToolsConfig };
  /** The tabbed surface whose candidates are managed (route navTabs plus registry slot tools). */
  parentRouteId: string;
  /** Persists the next toolsConfig through the channel's update mutation. */
  persist: (toolsConfig: ToolsConfig) => void;
}

/**
 * Admin card arranging a channel surface's tabs in a data grid: drag rows to reorder, toggle
 * visibility per tab, persisted on the channel in `toolsConfig['<channelType>.tabs']`. Candidates
 * list ungated, so tabs the viewer's own grants would hide stay manageable; `locked` tabs cannot
 * be hidden. UI visibility only, never authorization: enforcement belongs to permissions/quotas.
 */
export function TabsArrangementCard({ entity, parentRouteId, persist }: TabsArrangementCardProps) {
  const { t } = useTranslation();

  const slot = `${entity.entityType}.tabs`;
  const slotConfig = entity.toolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);

  // Draft order applied at drop time so the reorder animates as a response to the drop
  // instead of after the mutation round-trip; cleared once a persisted order arrives.
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const persistedOrderKey = (slotConfig?.order ?? []).join();
  useEffect(() => setDraftOrder(null), [persistedOrderKey]);

  const candidates = getNavTabCandidates(parentRouteId).map(({ id, label, resource, order, locked }) => ({
    id,
    label,
    resource,
    order,
    locked,
  }));
  const rows = orderBySlotConfig(candidates, draftOrder ? { order: draftOrder } : slotConfig).map((tab) => ({
    ...tab,
    name: t(tab.label, { resource: tab.resource ? t(tab.resource).toLowerCase() : '' }),
    visible: !hidden.has(tab.id),
  }));

  const persistSlot = (nextConfig: SlotToolsConfig) => persist({ [slot]: nextConfig });

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = rows.filter((row) => (row.id === id ? !visible : !row.visible)).map((row) => row.id);
    persistSlot({ order: rows.map((row) => row.id), hidden: nextHidden });
  };

  const onRowReorder = (fromIdx: number, toIdx: number, edge: 'top' | 'bottom') => {
    const ids = rows.map((row) => row.id);
    const [moved] = ids.splice(fromIdx, 1);
    let insertAt = edge === 'bottom' ? toIdx + 1 : toIdx;
    if (fromIdx < insertAt) insertAt -= 1;
    ids.splice(insertAt, 0, moved);
    setDraftOrder(ids);
    persistSlot({ order: ids, hidden: [...hidden] });
  };

  const columns: ColumnOrColumnGroup<TabRow>[] = [
    {
      key: 'drag-handle',
      name: '',
      width: 32,
      maxWidth: 32,
      cellClass: 'cursor-grab flex items-center justify-center',
      rowDragHandle: true,
      renderCell: () => <GripVerticalIcon className="icon-sm text-muted-foreground/50" />,
    },
    {
      key: 'label',
      name: '',
      minWidth: 160,
      renderCell: ({ row }) => <span className="truncate text-sm">{row.name}</span>,
    },
    {
      key: 'visible',
      name: t('c:visible'),
      width: 64,
      cellClass: 'flex items-center justify-center',
      headerCellClass: 'text-center',
      renderCell: ({ row }) =>
        row.locked ? (
          <LockIcon className="icon-sm opacity-50" aria-label={t('c:locked')} />
        ) : (
          <Switch checked={row.visible} onCheckedChange={(visible) => toggleHidden(row.id, visible)} />
        ),
    },
  ];

  return (
    <ToolCard label="c:tabs" description={t('c:tabs.text')}>
      <DataTable
        rows={rows}
        rowKeyGetter={rowKeyGetter}
        columns={columns}
        hasNextPage={false}
        readOnly
        enableVirtualization={false}
        onRowReorder={onRowReorder}
        renderRowDragPreview={renderRowDragPreview}
      />
    </ToolCard>
  );
}
