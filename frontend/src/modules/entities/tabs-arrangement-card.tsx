import { GripVerticalIcon, LockIcon } from 'lucide-react';
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
  order: number;
  locked?: boolean;
  visible: boolean;
}

/** Stable row key getter, defined outside the component to keep its identity stable. */
function rowKeyGetter(row: TabRow) {
  return row.id;
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

  const candidates = getNavTabCandidates(parentRouteId).map(({ id, label, resource, order, locked }) => ({
    id,
    label,
    resource,
    order,
    locked,
  }));
  const rows = orderBySlotConfig(candidates, slotConfig).map((tab) => ({ ...tab, visible: !hidden.has(tab.id) }));

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
      renderCell: ({ row }) => (
        <span className="truncate text-sm">
          {t(row.label, { resource: row.resource ? t(row.resource).toLowerCase() : '' })}
        </span>
      ),
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
      />
    </ToolCard>
  );
}
