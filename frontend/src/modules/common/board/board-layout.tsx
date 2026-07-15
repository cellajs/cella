import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { motion } from 'motion/react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isPanelReorderDragData, PanelDragHandleContext, reorderPanels } from '~/modules/common/board/board-drag';
import { useBoardStore } from '~/modules/common/board/board-store';
import { DropIndicator } from '~/modules/common/drop-indicator';
import {
  type PanelGroupApi,
  ResizablePanel,
  ResizablePanelGroup,
  ResizableSeparator,
} from '~/modules/common/resizable-panels/resizable-panels';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

export const PANEL_MIN_WIDTH = 300;
export const COLLAPSED_PANEL_MIN_WIDTH = 50;

export interface BoardLayoutPanel {
  panelId: string;
}

export interface BoardLayoutHandle {
  /** Expand a collapsed panel and scroll it into view. */
  expandAndScrollToPanel: (panelId: string) => void;
}

interface BoardLayoutProps {
  boardId: string;
  panels: BoardLayoutPanel[];
  defaultLayout: Record<string, number>;
  onLayoutChanged?: (layout: Record<string, number>) => void;
  children: (panelId: string, index: number) => ReactNode;
  /** When true, panels grow with content instead of being viewport-height constrained */
  autoHeight?: boolean;
  /** When true, panels can be reordered via drag-and-drop */
  reorderable?: boolean;
  /** Called after a panel is dragged to a new position */
  onPanelReorder?: (newOrder: string[], sourcePanelId: string) => void;
  className?: string;
  groupClassName?: string;
  separatorClassName?: string;
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
  className,
  groupClassName,
  separatorClassName,
  ref,
}: BoardLayoutProps) {
  const setCollapseState = useBoardStore((state) => state.togglePanelCollapsedState);
  const panelGroupApiRef = useRef<PanelGroupApi | null>(null);

  const handleReady = useCallback((api: PanelGroupApi) => {
    panelGroupApiRef.current = api;
  }, []);

  const handlePanelToggle = useCallback((panelId: string) => {
    panelGroupApiRef.current?.togglePanel(panelId);
  }, []);

  useImperativeHandle(ref, () => ({
    expandAndScrollToPanel(panelId: string) {
      panelGroupApiRef.current?.expandPanel(panelId);

      // Wait one frame for layout to settle after expand, then scroll
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-panel="${CSS.escape(panelId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest' });
      });
    },
  }));

  // Persisting is debounced at the storage layer (`idbKvStorage`), so a window resize firing
  // onLayoutChanged ~per frame coalesces into a single write, so no extra throttling is needed here.
  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      onLayoutChanged?.(layout);
    },
    [onLayoutChanged],
  );

  const handleCollapseChange = useCallback(
    (panelId: string, collapsed: boolean) => {
      setCollapseState(panelId, collapsed);
    },
    [setCollapseState],
  );

  // Keep a ref to current panel IDs so drag wrappers can read it without needing deps
  const panelIdsRef = useRef<string[]>([]);
  panelIdsRef.current = panels.map((p) => p.panelId);

  // Track which panel has a drop indicator and on which edge
  const [dropIndicator, setDropIndicator] = useState<{ panelId: string; edge: Edge } | null>(null);

  // Monitor for panel reorder drops
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
        const currentOrder = panelIdsRef.current;
        const newOrder = reorderPanels(currentOrder, source.data.panelId, target.data.panelId, edge);
        if (!newOrder) return;

        onPanelReorder?.(newOrder, source.data.panelId);
      },
    });
  }, [reorderable, onPanelReorder]);

  return (
    <ScrollArea
      className={cn('transition', !autoHeight && 'sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)]', className)}
      viewportClassName="overflow-y-hidden! overscroll-y-auto"
      horizontalScroll
      autoScrollOnDrag="horizontal"
    >
      <ResizablePanelGroup
        id={`panels-${boardId}`}
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
        onCollapseChange={handleCollapseChange}
        onReady={handleReady}
        className={cn('group/board', !autoHeight && 'h-[inherit]', groupClassName)}
      >
        {panels.map(({ panelId }, i) => (
          <motion.div
            key={panelId}
            layout="position"
            layoutId={`${boardId}-${panelId}`}
            className="relative flex shrink-0"
          >
            {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'left' && (
              <DropIndicator edge="left" gap={i === 0 ? 0 : 0.6} />
            )}
            <ResizablePanel
              id={panelId}
              minWidth={PANEL_MIN_WIDTH}
              collapsedWidth={COLLAPSED_PANEL_MIN_WIDTH}
              collapsible
            >
              {reorderable ? (
                <PanelDragWrapper
                  panelId={panelId}
                  index={i}
                  total={panels.length}
                  panelIdsRef={panelIdsRef}
                  onEdgeChange={setDropIndicator}
                  onPanelToggle={handlePanelToggle}
                  onPanelReorder={onPanelReorder}
                >
                  {children(panelId, i)}
                </PanelDragWrapper>
              ) : (
                children(panelId, i)
              )}
            </ResizablePanel>
            {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'right' && (
              <DropIndicator edge="right" gap={-0.1} />
            )}

            {i < panels.length - 1 && (
              <ResizableSeparator
                index={i}
                className={cn(
                  'mx-[0.02rem] w-1.5 rounded border border-background bg-transparent transition-all hover:bg-primary/50 data-[separator=drag]:bg-primary',
                  separatorClassName,
                )}
              />
            )}
          </motion.div>
        ))}
      </ResizablePanelGroup>
    </ScrollArea>
  );
}

/** Wraps a panel with drag-and-drop reorder support. Provides drag handle ref via context. */
function PanelDragWrapper({
  panelId,
  index,
  total,
  panelIdsRef,
  onEdgeChange,
  onPanelToggle,
  onPanelReorder,
  children,
}: {
  panelId: string;
  index: number;
  total: number;
  panelIdsRef: React.RefObject<string[]>;
  onEdgeChange: (indicator: { panelId: string; edge: Edge } | null) => void;
  onPanelToggle: (panelId: string) => void;
  onPanelReorder?: (newOrder: string[], sourcePanelId: string) => void;
  children: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [handleEl, setHandleEl] = useState<HTMLElement | null>(null);

  const registerHandle = useCallback((el: HTMLElement | null) => setHandleEl(el), []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();

      const currentOrder = panelIdsRef.current;
      const currentIdx = currentOrder.indexOf(panelId);
      const targetIdx = e.key === 'ArrowLeft' ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= currentOrder.length) return;

      const newOrder = [...currentOrder];
      [newOrder[currentIdx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[currentIdx]];
      onPanelReorder?.(newOrder, panelId);
    },
    [panelId, panelIdsRef, onPanelReorder],
  );

  const handleToggleCollapsed = useCallback(() => {
    onPanelToggle(panelId);
  }, [onPanelToggle, panelId]);

  const ctxValue = useMemo(
    () => ({ registerHandle, onKeyDown: handleKeyDown, onToggleCollapsed: handleToggleCollapsed, index, total }),
    [registerHandle, handleKeyDown, handleToggleCollapsed, index, total],
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
          attachClosestEdge(
            { dragItem: true, type: 'panelReorder' as const, panelId },
            { element: wrapper, input, allowedEdges: ['left', 'right'] },
          ),
        onDrag: ({ self, source }) => {
          const edge = extractClosestEdge(self.data);
          if (!edge || !isPanelReorderDragData(source.data)) return onEdgeChange(null);

          const panelIds = panelIdsRef.current;
          const targetIdx = panelIds.indexOf(panelId);
          const sourceIdx = panelIds.indexOf(source.data.panelId);
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
        draggable({
          element: wrapper,
          dragHandle: handleEl,
          getInitialData: () => ({ dragItem: true, type: 'panelReorder' as const, panelId }),
        }),
      );
    }

    return combine(...cleanups);
  }, [panelId, panelIdsRef, handleEl, onEdgeChange]);

  return (
    <PanelDragHandleContext.Provider value={ctxValue}>
      <div ref={wrapperRef} className="h-full">
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

/** Board panel content wrapper that switches between collapsed and expanded views */
export function BoardPanelContent({ isCollapsed, collapsedContent, children }: BoardPanelContentProps) {
  return <>{isCollapsed ? collapsedContent : children}</>;
}
