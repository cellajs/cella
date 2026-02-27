import { Fragment, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useBoardUIStore } from '~/modules/common/board-ui';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';
import { cn } from '~/utils/cn';

export const PANEL_MIN_WIDTH = 300;
export const COLLAPSED_PANEL_MIN_WIDTH = 50;

export interface BoardLayoutColumn {
  panelId: string;
}

/** Calculate the minimum width needed for all panels at their minimum sizes. */
export const calculateMinimumWidth = (columns: BoardLayoutColumn[]): number => {
  if (!columns.length) return 0;
  const collapseState = useBoardUIStore.getState().panelCollapseState;
  return columns.reduce((total, { panelId }) => {
    return total + (collapseState[panelId] ? COLLAPSED_PANEL_MIN_WIDTH : PANEL_MIN_WIDTH);
  }, 0);
};

/** If a panel is X% and must be ≥ Y px, container must be ≥ Y/(X/100) px. */
export const calculateRequiredWidth = (
  columns: BoardLayoutColumn[],
  layout: Record<string, number> | undefined,
  minimumWidth: number,
): number => {
  if (!columns.length || !layout) return minimumWidth;

  const collapseState = useBoardUIStore.getState().panelCollapseState;
  let requiredWidth = minimumWidth;

  for (const { panelId } of columns) {
    const percentage = layout[panelId];
    if (!percentage || percentage <= 0) continue;

    const isCollapsed = collapseState[panelId];
    const minPixels = isCollapsed ? COLLAPSED_PANEL_MIN_WIDTH : PANEL_MIN_WIDTH;

    const panelRequiredWidth = minPixels / (percentage / 100);
    requiredWidth = Math.max(requiredWidth, panelRequiredWidth);
  }

  return requiredWidth;
};

export interface BoardLayoutProps {
  boardId: string;
  columns: BoardLayoutColumn[];
  defaultSizes: Record<string, number>;
  onLayoutChanged?: (layout: Record<string, number>) => void;
  children: (panelId: string, index: number) => ReactNode;
  /** When true, columns grow with content instead of being viewport-height constrained */
  autoHeight?: boolean;
  className?: string;
  groupClassName?: string;
  separatorClassName?: string;
}

/**
 * Generic board layout with resizable, collapsible panels.
 */
export function BoardLayout({
  boardId,
  columns,
  defaultSizes,
  onLayoutChanged,
  children,
  autoHeight,
  className,
  groupClassName,
  separatorClassName,
}: BoardLayoutProps) {
  const panelRefs = useRef<Record<string, PanelImperativeHandle | null>>({});
  const isDragging = useRef(false);
  const toggleCollapsedState = useBoardUIStore((state) => state.togglePanelCollapsedState);
  const [containerMinWidth, setContainerMinWidth] = useState<number>(0);

  // Reset isDragging on pointer release (handles pointer leaving separator)
  useEffect(() => {
    const handlePointerUp = () => {
      isDragging.current = false;
    };
    document.addEventListener('pointerup', handlePointerUp);
    return () => document.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const minimumWidth = calculateMinimumWidth(columns);
  const effectiveMinWidth = Math.max(minimumWidth, containerMinWidth);

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number> | null) => {
      if (!layout) return;
      onLayoutChanged?.(layout);
      const requiredWidth = calculateRequiredWidth(columns, layout, minimumWidth);
      setContainerMinWidth(requiredWidth);
    },
    [columns, minimumWidth, onLayoutChanged],
  );

  useEffect(() => {
    setContainerMinWidth(0);
  }, [columns.length]);

  useEffect(() => {
    const currentPanelIds = new Set(columns.map(({ panelId }) => panelId));
    for (const key of Object.keys(panelRefs.current)) {
      if (!currentPanelIds.has(key)) delete panelRefs.current[key];
    }
  }, [columns]);

  return (
    <div
      className={cn(
        'transition overflow-x-auto',
        !autoHeight && 'sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)]',
        className,
      )}
    >
      <div className={autoHeight ? undefined : 'h-[inherit]'} style={{ minWidth: effectiveMinWidth }}>
        <ResizableGroup
          orientation="horizontal"
          className={cn('flex gap-2 group/board', groupClassName)}
          id={`panels-${boardId}`}
          onLayoutChanged={handleLayoutChanged}
        >
          {columns.map(({ panelId }, i) => (
            <Fragment key={panelId}>
              <ResizablePanel
                panelRef={(el: PanelImperativeHandle | null) => {
                  panelRefs.current[panelId] = el;
                }}
                id={panelId}
                minSize={PANEL_MIN_WIDTH}
                collapsedSize={COLLAPSED_PANEL_MIN_WIDTH}
                defaultSize={defaultSizes[panelId]}
                collapsible
                onResize={(panelSize, _id, prevSize) => {
                  if (prevSize === undefined || !isDragging.current) return;
                  const isCollapsed = panelSize.inPixels <= COLLAPSED_PANEL_MIN_WIDTH + 5;
                  const wasCollapsed = prevSize.inPixels <= COLLAPSED_PANEL_MIN_WIDTH + 5;
                  if (isCollapsed !== wasCollapsed) {
                    toggleCollapsedState(panelId, isCollapsed);
                  }
                }}
              >
                {children(panelId, i)}
              </ResizablePanel>

              {i < columns.length - 1 && (
                <ResizableSeparator
                  onPointerDown={() => {
                    isDragging.current = true;
                  }}
                  className={cn(
                    'w-1.5 rounded border border-background -mx-2 bg-transparent hover:bg-primary/50 data-[resize-handle-state=drag]:bg-primary transition-all',
                    separatorClassName,
                  )}
                />
              )}
            </Fragment>
          ))}
        </ResizableGroup>
      </div>
    </div>
  );
}

export interface BoardPanelContentProps {
  isCollapsed: boolean;
  collapsedContent: ReactNode;
  children: ReactNode;
}

/** Board panel content wrapper that switches between collapsed and expanded views */
export function BoardPanelContent({ isCollapsed, collapsedContent, children }: BoardPanelContentProps) {
  return <>{isCollapsed ? collapsedContent : children}</>;
}
