import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { isPanelReorderDragData, PanelDragHandleContext, PanelToggleContext, reorderPanels } from '~/modules/common/board/board-drag';
import { boardStore, useBoardStore } from '~/modules/common/board/board-store';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import { type PanelGroupApi, ResizablePanel, ResizablePanelGroup, ResizableSeparator } from '~/modules/common/resizable-panels/resizable-panels';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

/** Minimum width of an expanded board panel, in px. */
export const panelMinWidth = 300;
/** Minimum width of a collapsed board panel, in px. */
export const collapsedPanelMinWidth = 50;

export interface BoardLayoutPanel {
  panelId: string;
  /** Accessible name of the panel's region. */
  label?: string;
  /** Consecutive panels of one group move as one under `groupHeader`, and still resize and collapse apart. */
  group?: { id: string; label: string };
}

/** What a drag moves: one panel, or the panels of a group. */
interface ReorderItem {
  id: string;
  group?: BoardLayoutPanel['group'];
  panels: BoardLayoutPanel[];
  /** Index of its first panel among all panels: separators and panels are counted flat. */
  start: number;
}

const toReorderItems = (panels: BoardLayoutPanel[]) => {
  const items: ReorderItem[] = [];
  panels.forEach((panel, index) => {
    const last = items.at(-1);
    if (panel.group && last?.group?.id === panel.group.id) last.panels.push(panel);
    else items.push({ id: panel.group?.id ?? panel.panelId, group: panel.group, panels: [panel], start: index });
  });
  return items;
};

export interface BoardLayoutHandle {
  expandAndScrollToPanel: (panelId: string) => void;
}

interface BoardLayoutProps {
  boardId: string;
  panels: BoardLayoutPanel[];
  defaultLayout: Record<string, number>;
  onLayoutChanged?: (layout: Record<string, number>) => void;
  children: (panelId: string, index: number) => ReactNode;
  /** When true, panels grow with content without a viewport-height constraint. */
  autoHeight?: boolean;
  reorderable?: boolean;
  onPanelReorder?: (newOrder: string[], sourcePanelId: string) => void;
  /** `marked` when panel content carries `hintFadeOut`, so frames and avatars stay solid through a collapse hint */
  panelFade?: 'all' | 'marked';
  /** The header of a group, spanning its panels. */
  groupHeader?: (groupId: string) => ReactNode;
  ref?: React.Ref<BoardLayoutHandle>;
}

// Panel widths are pixel-based (not percentage); the wrapping ScrollArea adds auto-scroll during drag-and-drop.
export function BoardLayout({
  boardId,
  panels,
  defaultLayout,
  onLayoutChanged,
  children,
  autoHeight,
  reorderable,
  onPanelReorder,
  panelFade,
  groupHeader,
  ref,
}: BoardLayoutProps) {
  const setPanelCollapsed = useBoardStore((state) => state.setPanelCollapsed);
  const panelGroupApiRef = useRef<PanelGroupApi | null>(null);

  const handleReady = useCallback((api: PanelGroupApi) => {
    panelGroupApiRef.current = api;
  }, []);

  const handlePanelToggle = useCallback((panelId: string) => {
    panelGroupApiRef.current?.togglePanel(panelId);
  }, []);

  const items = toReorderItems(panels);
  const itemsRef = useLatestRef(items);

  const handleItemToggle = useCallback(
    (itemId: string) => {
      const panelIds = itemsRef.current.find((item) => item.id === itemId)?.panels.map((panel) => panel.panelId) ?? [];
      const { panelCollapseState } = boardStore.getState();
      const collapse = !panelIds.every((panelId) => panelCollapseState[panelId]);
      for (const panelId of panelIds) {
        if (!!panelCollapseState[panelId] !== collapse) panelGroupApiRef.current?.togglePanel(panelId);
      }
    },
    [itemsRef],
  );

  // The store only holds the state, so a panel marked open from outside, to reveal a form in it, gets its width here
  useEffect(
    () =>
      useBoardStore.subscribe((state, prev) => {
        if (state.panelCollapseState === prev.panelCollapseState) return;
        for (const [panelId, collapsed] of Object.entries(prev.panelCollapseState)) {
          if (collapsed && !state.panelCollapseState[panelId]) panelGroupApiRef.current?.expandPanel(panelId);
        }
      }),
    [],
  );

  useImperativeHandle(ref, () => ({
    expandAndScrollToPanel(panelId: string) {
      panelGroupApiRef.current?.expandPanel(panelId);

      // Wait one frame for the expand to settle before scrolling
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-panel="${CSS.escape(panelId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
      });
    },
  }));

  // `idbKvStorage` debounces writes, so per-frame onLayoutChanged calls need no throttling here
  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      onLayoutChanged?.(layout);
    },
    [onLayoutChanged],
  );

  // Keep a ref to the current order so drag wrappers can read it without needing deps
  const itemIdsRef = useLatestRef(items.map((item) => item.id));

  const [dropIndicator, setDropIndicator] = useState<{ panelId: string; edge: Edge } | null>(null);

  // pdnd's onDrag fires continuously over a target; keeping the previous object skips re-renders while the edge holds
  const updateDropIndicator = useCallback((next: { panelId: string; edge: Edge } | null) => {
    setDropIndicator((prev) => (prev?.panelId === next?.panelId && prev?.edge === next?.edge ? prev : next));
  }, []);

  useEffect(() => {
    if (!reorderable) return;
    return monitorForElements({
      canMonitor: ({ source }) => isPanelReorderDragData(source.data),
      onDrop: ({ source, location }) => {
        setDropIndicator(null);
        const target = location.current.dropTargets[0];
        if (!target) return;
        if (!isPanelReorderDragData(source.data) || !isPanelReorderDragData(target.data)) return;

        const edge = extractClosestEdge(target.data);
        const currentOrder = itemIdsRef.current;
        const newOrder = reorderPanels(currentOrder, source.data.panelId, target.data.panelId, edge);
        if (!newOrder) return;

        onPanelReorder?.(newOrder, source.data.panelId);
      },
    });
  }, [reorderable, onPanelReorder, itemIdsRef]);

  const renderPanel = ({ panelId, label }: BoardLayoutPanel, index: number) => (
    <ResizablePanel id={panelId} minWidth={panelMinWidth} collapsedWidth={collapsedPanelMinWidth} collapsible fade={panelFade} label={label}>
      {children(panelId, index)}
    </ResizablePanel>
  );

  const renderSeparator = (index: number) =>
    index < panels.length - 1 && (
      <ResizableSeparator
        index={index}
        className="mx-[0.02rem] w-1.5 rounded border border-background bg-transparent transition-colors hover:bg-primary/50 focus-visible:bg-primary data-[separator=drag]:bg-primary"
      />
    );

  const renderItemContent = ({ id, group, panels: itemPanels, start }: ReorderItem) => {
    if (!group) return renderPanel(itemPanels[0], start);

    return (
      // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own frame and legend layout around the panels
      <div role="group" aria-label={group.label} data-panel-group={id} className="flex flex-col">
        {/* Zero intrinsic width: a long header cannot widen the group past its panels */}
        <div className="w-0 min-w-full">{groupHeader?.(id)}</div>
        <div className="flex min-h-0 flex-1">
          {itemPanels.map((panel, offset) => (
            <Fragment key={panel.panelId}>
              {renderPanel(panel, start + offset)}
              {offset < itemPanels.length - 1 && renderSeparator(start + offset)}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  const panelGroup = (
    <PanelToggleContext.Provider value={reorderable ? handlePanelToggle : null}>
      <ResizablePanelGroup
        id={`panels-${boardId}`}
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
        onCollapseChange={setPanelCollapsed}
        onReady={handleReady}
        className={cn('group/board', !autoHeight && 'h-[inherit]')}
      >
        {items.map((item, i) => (
          <motion.div key={item.id} layout="position" layoutId={`${boardId}-${item.id}`} className="relative flex shrink-0">
            {reorderable && dropIndicator?.panelId === item.id && dropIndicator.edge === 'left' && (
              <DropIndicator edge="left" gap={i === 0 ? 0 : 0.6} />
            )}
            {reorderable ? (
              <PanelDragWrapper
                panelId={item.id}
                panelIds={item.panels.map((panel) => panel.panelId)}
                index={i}
                total={items.length}
                itemIdsRef={itemIdsRef}
                onEdgeChange={updateDropIndicator}
                onItemToggle={handleItemToggle}
                onPanelReorder={onPanelReorder}
              >
                {renderItemContent(item)}
              </PanelDragWrapper>
            ) : (
              renderItemContent(item)
            )}
            {reorderable && dropIndicator?.panelId === item.id && dropIndicator.edge === 'right' && <DropIndicator edge="right" gap={-0.1} />}

            {renderSeparator(item.start + item.panels.length - 1)}
          </motion.div>
        ))}
      </ResizablePanelGroup>
    </PanelToggleContext.Provider>
  );

  // Window-scroll mode clips horizontal overflow without creating a scroll container, so section
  // bars and card headers stay sticky to the window.
  if (autoHeight) {
    return <div className="overflow-x-clip transition">{panelGroup}</div>;
  }

  // contain on x bounces the board at its ends: on auto the overscroll chains to the page, which Chrome slides sideways as a whole
  return (
    <ScrollArea
      className="transition sm:h-[calc(100dvh-var(--board-offset-sm,4rem))] md:h-[calc(100dvh-var(--board-offset-md,4.88rem))]"
      viewportClassName="overflow-y-hidden! overscroll-x-contain overscroll-y-auto"
      horizontalScroll
      autoScrollOnDrag="horizontal"
    >
      {panelGroup}
    </ScrollArea>
  );
}

/** Wraps a panel or a group with drag-and-drop reorder support. Provides drag handle ref via context. */
function PanelDragWrapper({
  panelId,
  panelIds,
  index,
  total,
  itemIdsRef,
  onEdgeChange,
  onItemToggle,
  onPanelReorder,
  children,
}: {
  panelId: string;
  /** The panels it moves. */
  panelIds: string[];
  index: number;
  total: number;
  itemIdsRef: React.RefObject<string[]>;
  onEdgeChange: (indicator: { panelId: string; edge: Edge } | null) => void;
  onItemToggle: (itemId: string) => void;
  onPanelReorder?: (newOrder: string[], sourcePanelId: string) => void;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [handleEl, setHandleEl] = useState<HTMLElement | null>(null);
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);
  const isCollapsed = useBoardStore((state) => panelIds.every((id) => !!state.panelCollapseState[id]));

  const registerHandle = useCallback((el: HTMLElement | null) => setHandleEl(el), []);

  const handleMove = useCallback(
    (step: -1 | 1) => {
      const currentOrder = itemIdsRef.current;
      const currentIdx = currentOrder.indexOf(panelId);
      const targetIdx = currentIdx + step;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;

      const newOrder = [...currentOrder];
      [newOrder[currentIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[currentIdx]];
      onPanelReorder?.(newOrder, panelId);
    },
    [panelId, itemIdsRef, onPanelReorder],
  );

  const handleToggleCollapsed = useCallback(() => {
    onItemToggle(panelId);
  }, [onItemToggle, panelId]);

  const ctxValue = useMemo(
    () => ({ panelId, registerHandle, onMove: handleMove, onToggleCollapsed: handleToggleCollapsed, isCollapsed, previewContainer, index, total }),
    [panelId, registerHandle, handleMove, handleToggleCollapsed, isCollapsed, previewContainer, index, total],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const cleanups: (() => void)[] = [
      dropTargetForElements({
        element: wrapper,
        canDrop: ({ source }) => isPanelReorderDragData(source.data) && source.data.panelId !== panelId,
        getIsSticky: () => true,
        getData: ({ input }) =>
          attachClosestEdge({ dragItem: true, type: 'panelReorder' as const, panelId }, { element: wrapper, input, allowedEdges: ['left', 'right'] }),
        onDrag: ({ self, source }) => {
          const edge = extractClosestEdge(self.data);
          if (!edge || !isPanelReorderDragData(source.data)) return onEdgeChange(null);

          const itemIds = itemIdsRef.current;
          const targetIdx = itemIds.indexOf(panelId);
          const sourceIdx = itemIds.indexOf(source.data.panelId);
          const neighborIdx = edge === 'left' ? targetIdx - 1 : targetIdx + 1;
          if (sourceIdx === neighborIdx) return onEdgeChange(null);

          onEdgeChange({ panelId, edge });
        },
        onDragLeave: () => onEdgeChange(null),
        onDrop: () => onEdgeChange(null),
      }),
    ];

    if (handleEl) {
      cleanups.push(
        // The handle, not the panel, is the drag source: a draggable element turns off text selection for everything in it
        draggable({
          element: handleEl,
          getInitialData: () => ({ dragItem: true, type: 'panelReorder' as const, panelId }),
          onDrop: () => followReorderFocus(panelId),
          onGenerateDragPreview: ({ nativeSetDragImage }) => {
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview({ x: '8px', y: '4px' }),
              render({ container }) {
                setPreviewContainer(container);
                return () => setPreviewContainer(null);
              },
            });
          },
        }),
      );
    }

    return combine(...cleanups);
  }, [panelId, itemIdsRef, handleEl, onEdgeChange]);

  return (
    <PanelDragHandleContext.Provider value={ctxValue}>
      <div ref={wrapperRef} className="flex">
        {children}
      </div>
    </PanelDragHandleContext.Provider>
  );
}

interface BoardPanelContentProps {
  isCollapsed: boolean;
  collapsedContent: ReactNode;
  children: ReactNode;
}

export function BoardPanelContent({ isCollapsed, collapsedContent, children }: BoardPanelContentProps) {
  return <>{isCollapsed ? collapsedContent : children}</>;
}
