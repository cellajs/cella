import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { motion } from 'motion/react';
import { type ReactNode, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { PanelCollapseContext, PanelDragHandleContext } from '~/modules/common/board/board-drag';
import { useBoardStore } from '~/modules/common/board/board-store';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import {
  type PanelGroupApi,
  panelGlideDuration,
  ResizablePanel,
  ResizablePanelGroup,
  ResizableSeparator,
} from '~/modules/common/resizable-panels/resizable-panels';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';
import { scrollBehavior } from '~/utils/reduced-motion';

/** In px */
export const panelMinWidth = 300;
/** In px */
export const collapsedPanelMinWidth = 50;

export interface BoardLayoutPanel {
  panelId: string;
  /** Accessible name */
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
  /** Panels grow with their content, with no fixed viewport height */
  autoHeight?: boolean;
  reorderable?: boolean;
  onPanelReorder?: (newOrder: string[], sourcePanelId: string) => void;
  /** `marked` when panel content carries `hintFadeOut`, so frames and avatars stay solid through a collapse hint */
  panelFade?: 'all' | 'marked';
  /** The row always fits its parent, for a parent that cannot scroll: see the F rules in resizable-panels.md. */
  mustFit?: boolean;
  ref?: React.Ref<BoardLayoutHandle>;
}

type PanelReorderDragData = { dragItem: true; type: 'panelReorder'; panelId: string };

const isPanelReorderDragData = (data: Record<string | symbol, unknown>): data is PanelReorderDragData =>
  data.dragItem === true && data.type === 'panelReorder' && typeof data.panelId === 'string';

/** Compute new panel order after dragging sourceId relative to targetId. Returns null if unchanged. */
function reorderPanels(currentOrder: string[], sourceId: string, targetId: string, edge: Edge | null): string[] | null {
  const fromIndex = currentOrder.indexOf(sourceId);
  const toIndex = currentOrder.indexOf(targetId);
  if (fromIndex === -1 || toIndex === -1) return null;

  const newOrder = currentOrder.filter((id) => id !== sourceId);
  const newTargetIdx = newOrder.indexOf(targetId);
  const insertIdx = edge === 'right' ? newTargetIdx + 1 : newTargetIdx;
  newOrder.splice(insertIdx, 0, sourceId);

  if (newOrder.every((id, i) => currentOrder[i] === id)) return null;
  return newOrder;
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
  mustFit,
  ref,
}: BoardLayoutProps) {
  const { t } = useTranslation();
  const setPanelCollapsed = useBoardStore((state) => state.setPanelCollapsed);
  const fit = useBoardStore((state) => state.boardFits[boardId] ?? false);
  const setBoardFit = useBoardStore((state) => state.setBoardFit);
  const panelGroupApiRef = useRef<PanelGroupApi | null>(null);
  // The end handle pulls an overflowing row into fit; a clipping parent or a must-fit row never overflows
  const endHandle = !mustFit && !autoHeight;

  const handleFitChange = useCallback((next: boolean) => setBoardFit(boardId, next), [boardId, setBoardFit]);

  const handleReady = useCallback((api: PanelGroupApi) => {
    panelGroupApiRef.current = api;
  }, []);

  const handlePanelToggle = useCallback((panelId: string) => panelGroupApiRef.current?.togglePanel(panelId), []);

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

      // Once the glide has the panel at its open width
      window.setTimeout(() => {
        const el = document.querySelector(`[data-panel="${CSS.escape(panelId)}"]`);
        el?.scrollIntoView({ behavior: scrollBehavior(), inline: 'nearest' });
      }, panelGlideDuration);
    },
  }));

  // `idbKvStorage` debounces writes, so per-frame onLayoutChanged calls need no throttling here
  const handleLayoutChanged = useCallback((layout: Record<string, number>) => onLayoutChanged?.(layout), [onLayoutChanged]);

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
      {...{ defaultLayout, mustFit, fit }}
      onLayoutChanged={handleLayoutChanged}
      onCollapseChange={setPanelCollapsed}
      onReady={handleReady}
      onFitChange={handleFitChange}
      className={cn('group/board', !autoHeight && 'h-[inherit]')}
    >
      {panels.map(({ panelId, label }, i) => (
        <motion.div
          key={panelId}
          // With nothing to reorder, this would only slide panels while a fit snaps their widths. No layoutId: keys are stable, and
          // with one, motion snapshots a panel on unmount, which StrictMode's simulated remount turns into a slide from its pre-fit place.
          layout={reorderable ? 'position' : false}
          className="relative flex shrink-0"
        >
          {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'left' && (
            <DropIndicator edge="left" gap={i === 0 ? 0 : 0.6} />
          )}
          <ResizablePanel id={panelId} minWidth={panelMinWidth} collapsedWidth={collapsedPanelMinWidth} collapsible fade={panelFade} label={label}>
            <PanelCollapseScope panelId={panelId} onToggle={handlePanelToggle}>
              {reorderable ? (
                <PanelDragWrapper
                  {...{ panelId, panelIdsRef, onPanelReorder }}
                  index={i}
                  total={panels.length}
                  onEdgeChange={updateDropIndicator}
                  onPanelToggle={handlePanelToggle}
                >
                  {children(panelId, i)}
                </PanelDragWrapper>
              ) : (
                children(panelId, i)
              )}
            </PanelCollapseScope>
          </ResizablePanel>
          {reorderable && dropIndicator?.panelId === panelId && dropIndicator.edge === 'right' && <DropIndicator edge="right" gap={-0.1} />}

          {(i < panels.length - 1 || endHandle) && (
            <ResizableSeparator
              index={i}
              aria-label={i === panels.length - 1 ? t('c:fit_panels') : undefined}
              className="border-background hover:bg-primary/50 focus-visible:bg-primary data-[separator=drag]:bg-primary mx-[0.02rem] w-1.5 rounded border bg-transparent transition-colors"
            />
          )}
        </motion.div>
      ))}
    </ResizablePanelGroup>
  );

  // Clips without a scroll container, so section bars and card headers stay sticky to the window
  // isolate: the board stacks as one layer, so its sticky headers and rings stay under the page's search field and tabs
  if (autoHeight) return <div className="isolate overflow-x-clip transition">{panelGroup}</div>;

  // none on x: on auto the overscroll chains to the page, which Chrome slides sideways as a whole
  return (
    <ScrollArea
      className="isolate transition sm:h-[calc(100dvh-var(--board-offset-sm,4rem))] md:h-[calc(100dvh-var(--board-offset-md,4.88rem))]"
      viewportClassName="overflow-y-hidden! overscroll-x-none overscroll-y-auto"
      horizontalScroll
      autoScrollOnDrag="horizontal"
    >
      {panelGroup}
    </ScrollArea>
  );
}

function PanelCollapseScope({ panelId, onToggle, children }: { panelId: string; onToggle: (panelId: string) => void; children: ReactNode }) {
  const value = useMemo(() => ({ panelId, onToggleCollapsed: () => onToggle(panelId) }), [panelId, onToggle]);
  return <PanelCollapseContext.Provider value={value}>{children}</PanelCollapseContext.Provider>;
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

  const handleToggleCollapsed = useCallback(() => onPanelToggle(panelId), [onPanelToggle, panelId]);

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
          onGenerateDragPreview: ({ nativeSetDragImage }) =>
            setCustomNativeDragPreview({
              nativeSetDragImage,
              getOffset: pointerOutsideOfPreview({ x: '8px', y: '4px' }),
              render({ container }) {
                setPreviewContainer(container);
                return () => setPreviewContainer(null);
              },
            }),
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
