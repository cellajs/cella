import { GripVerticalIcon, LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { orderBySlotConfig } from '~/lib/placements';
import { DataTable } from '~/modules/common/data-table/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { HelpText } from '~/modules/common/help-text';
import { getNavTabCandidates } from '~/modules/common/page/tab-nav';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Switch } from '~/modules/ui/switch';

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

  const slot = `${entity.entityType}.tabs`;
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
    description: tab.description
      ? t(tab.description, { resource: tab.resource ? t(tab.resource).toLowerCase() : '' })
      : undefined,
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
      name: t('c:resource_name', { resource: t('c:tab') }),
      minWidth: 160,
      renderCell: ({ row }) => {
        if (!row.description) return <span className="truncate text-sm">{row.name}</span>;

        // Fixed row height leaves no room for a second line on narrow screens, so the description moves into a popover
        if (isMobile) {
          return (
            <HelpText type="popover" className="mb-0" content={row.description}>
              <span className="truncate text-sm">{row.name}</span>
            </HelpText>
          );
        }

        return (
          <div className="flex min-w-0 flex-col justify-center">
            <span className="truncate text-sm leading-tight">{row.name}</span>
            <span className="truncate text-muted-foreground text-xs leading-tight">{row.description}</span>
          </div>
        );
      },
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
    </ToolCard>
  );
}
