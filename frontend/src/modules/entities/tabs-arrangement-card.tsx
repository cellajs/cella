import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon, LockIcon } from 'lucide-react';
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
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';
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

  // The same reorder one step at a time, for the keyboard and for a pointer that cannot drag
  const [moveStatus, setMoveStatus] = useState('');
  const moveRow = (fromIdx: number, step: -1 | 1) => {
    const toIdx = fromIdx + step;
    if (toIdx < 0 || toIdx >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[fromIdx], ids[toIdx]] = [ids[toIdx], ids[fromIdx]];
    reorder(ids);
    setMoveStatus(t('c:success.move_position', { name: rows[fromIdx].name, position: toIdx + 1, total: rows.length }));
  };

  // A phone has no room for the drag handle beside the move buttons, and the buttons do the same there
  const dragHandleColumn: ColumnOrColumnGroup<TabRow> = {
    key: 'drag-handle',
    name: '',
    width: 32,
    maxWidth: 32,
    cellClass: tw('flex cursor-grab items-center justify-center'),
    rowDragHandle: true,
    renderCell: () => <GripVerticalIcon className="size-3.5 text-muted-foreground" />,
  };

  const columns: ColumnOrColumnGroup<TabRow>[] = [
    ...(isMobile ? [] : [dragHandleColumn]),
    {
      key: 'label',
      name: t('c:resource_name', { resource: t('c:tab') }),
      minWidth: isMobile ? 132 : 160,
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
      key: 'move',
      name: t('c:order'),
      width: isMobile ? 64 : 72,
      cellClass: tw('flex items-center justify-center'),
      headerCellClass: 'text-center',
      renderCell: ({ row, rowIdx }) => (
        <>
          <Button
            variant="ghost"
            size="micro"
            className="size-7 aria-disabled:cursor-default aria-disabled:opacity-40"
            aria-label={`${t('c:move_up')}: ${row.name}`}
            aria-disabled={rowIdx === 0}
            onClick={() => moveRow(rowIdx, -1)}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="micro"
            className="size-7 aria-disabled:cursor-default aria-disabled:opacity-40"
            aria-label={`${t('c:move_down')}: ${row.name}`}
            aria-disabled={rowIdx === rows.length - 1}
            onClick={() => moveRow(rowIdx, 1)}
          >
            <ChevronDownIcon />
          </Button>
        </>
      ),
    },
    {
      key: 'visible',
      name: t('c:visible'),
      width: 64,
      cellClass: tw('flex items-center justify-center'),
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
