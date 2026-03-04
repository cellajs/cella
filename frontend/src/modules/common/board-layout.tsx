import { Fragment, type ReactNode, useCallback } from 'react';
import { useBoardUIStore } from '~/modules/common/board-ui';
import { ResizablePanel, ResizablePanelGroup, ResizableSeparator } from '~/modules/common/resizable-panels';
import { cn } from '~/utils/cn';

export const PANEL_MIN_WIDTH = 300;
export const COLLAPSED_PANEL_MIN_WIDTH = 50;

export interface BoardLayoutColumn {
  panelId: string;
}

export interface BoardLayoutProps {
  boardId: string;
  columns: BoardLayoutColumn[];
  defaultLayout: Record<string, number>;
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
 *
 * Uses pixel-based panel widths. Overflow is handled by the outer
 * `overflow-x-auto` container — no special overflow logic needed.
 */
export function BoardLayout({
  boardId,
  columns,
  defaultLayout,
  onLayoutChanged,
  children,
  autoHeight,
  className,
  groupClassName,
  separatorClassName,
}: BoardLayoutProps) {
  const setCollapseState = useBoardUIStore((state) => state.togglePanelCollapsedState);

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

  return (
    <div
      className={cn(
        'transition overflow-x-auto',
        !autoHeight && 'sm:h-[calc(100vh-4rem)] md:h-[calc(100vh-4.88rem)]',
        className,
      )}
    >
      <ResizablePanelGroup
        id={`panels-${boardId}`}
        defaultLayout={defaultLayout}
        onLayoutChanged={handleLayoutChanged}
        onCollapseChange={handleCollapseChange}
        className={cn('group/board', !autoHeight && 'h-[inherit]', groupClassName)}
      >
        {columns.map(({ panelId }, i) => (
          <Fragment key={panelId}>
            <ResizablePanel
              id={panelId}
              minWidth={PANEL_MIN_WIDTH}
              collapsedWidth={COLLAPSED_PANEL_MIN_WIDTH}
              collapsible
            >
              {children(panelId, i)}
            </ResizablePanel>

            {i < columns.length - 1 && (
              <ResizableSeparator
                index={i}
                className={cn(
                  'w-1.5 mx-[0.02rem] rounded border border-background bg-transparent hover:bg-primary/50 data-[separator=drag]:bg-primary transition-all',
                  separatorClassName,
                )}
              />
            )}
          </Fragment>
        ))}
      </ResizablePanelGroup>
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
