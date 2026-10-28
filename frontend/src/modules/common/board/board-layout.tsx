import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { isPanelReorderDragData, PanelDragHandleContext, reorderPanels } from '~/modules/common/board/board-drag';
import { useBoardStore } from '~/modules/common/board/board-store';
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
}

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

  // Keep a ref to current panel IDs so drag wrappers can read it without needing deps
  const panelIdsRef = useLatestRef(panels.map((p) => p.panelId));

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
        const currentOrder = panelIdsRef.current;
        const newOrder = reorderPanels(currentOrder, source.data.panelId, target.data.panelId, edge);
        if (!newOrder) return;

        onPanelReorder?.(newOrder, source.data.panelId);
      },
    });
  }, [reorderable, onPanelReorder]);

  const panelGroup = (
    <ResizablePanelGroup
      id={`panels-${boardId}`}
      defaultLayout={defaultLayout}
      onLayoutChanged={handleLayoutChanged}
      onCollapseChange={setPanelCollapsed}
      onReady={handleReady}
      className={cn('group/board', !autoHeight && 'h-[inherit]')}
    >
      {panels.map(({ panelId, label }, i) => (
        <motion.div key={panelId} layout="position" layoutId={`${boardId}-${panelId}`} className="relative flex shrink-0">
          {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'left' && (
            <DropIndicator edge="left" gap={i === 0 ? 0 : 0.6} />
          )}
          <ResizablePanel id={panelId} minWidth={panelMinWidth} collapsedWidth={collapsedPanelMinWidth} collapsible fade={panelFade} label={label}>
            {reorderable ? (
              <PanelDragWrapper
                panelId={panelId}
                index={i}
                total={panels.length}
                panelIdsRef={panelIdsRef}
                onEdgeChange={updateDropIndicator}
                onPanelToggle={handlePanelToggle}
                onPanelReorder={onPanelReorder}
              >
                {children(panelId, i)}
              </PanelDragWrapper>
            ) : (
              children(panelId, i)
            )}
          </ResizablePanel>
          {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'right' && <DropIndicator edge="right" gap={-0.1} />}

          {i < panels.length - 1 && (
            <ResizableSeparator
              index={i}
              className="mx-[0.02rem] w-1.5 rounded border border-background bg-transparent transition-colors hover:bg-primary/50 focus-visible:bg-primary data-[separator=drag]:bg-primary"
            />
          )}
        </motion.div>
      ))}
    </ResizablePanelGroup>
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
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);

  const registerHandle = useCallback((el: HTMLElement | null) => setHandleEl(el), []);

  const handleMove = useCallback(
    (step: -1 | 1) => {
      const currentOrder = panelIdsRef.current;
      const currentIdx = currentOrder.indexOf(panelId);
      const targetIdx = currentIdx + step;
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
    () => ({ panelId, registerHandle, onMove: handleMove, onToggleCollapsed: handleToggleCollapsed, previewContainer, index, total }),
    [panelId, registerHandle, handleMove, handleToggleCollapsed, previewContainer, index, total],
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

export function BoardPanelContent({ isCollapsed, collapsedContent, children }: BoardPanelContentProps) {
  return <>{isCollapsed ? collapsedContent : children}</>;
}
