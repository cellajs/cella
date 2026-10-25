import { ChevronsLeftRightIcon, ChevronsRightLeftIcon, GripVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePanelDragHandle } from '~/modules/common/board/board-drag';
import { useBoardStore } from '~/modules/common/board/board-store';
import { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';
import { hintFadeOut } from '~/modules/common/resizable-panels/resizable-panels';
import { Button, buttonVariants } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';

interface PanelDragHandleButtonProps {
  /** Sortable name announced by screen readers (e.g. the project or section name). */
  name: string;
  /** aria-label when the board isn't reorderable (no drag handle). Omit to leave it unlabeled. */
  fallbackLabel?: string;
  /** Per-panel layout classes (collapsed vs expanded shape). */
  className?: string;
  /** Leading icon or avatar; when the board is reorderable it swaps to a drag grip on hover. */
  icon: ReactNode;
  /** Chip shown under the pointer while dragging; defaults to a chip with the name. */
  preview?: ReactNode;
  /** Trailing label content (kept visible on hover), shown only while the panel is expanded. */
  children?: ReactNode;
}

/**
 * A panel header button that is also the panel's reorder handle, from the board's drag context (null when the board is
 * not reorderable): a click collapses the panel, ←/→ move it, and its move menu leads with the collapse. On hover the
 * `icon` cross-fades to a drag grip.
 */
export function PanelDragHandleButton({ name, fallbackLabel, className, icon, preview, children }: PanelDragHandleButtonProps) {
  const { t } = useTranslation();
  const panelDrag = usePanelDragHandle();
  const isCollapsed = useBoardStore((state) => !!panelDrag && !!state.panelCollapseState[panelDrag.panelId]);

  const content = (
    <>
      <span className="relative inline-flex shrink-0 items-center justify-center">
        <span className={cn('inline-flex', panelDrag && 'transition-[opacity,filter] group-hover/drag:opacity-30 group-hover/drag:blur-[1px]')}>
          {icon}
        </span>
        {panelDrag && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/drag:opacity-100">
            <GripVerticalIcon className="size-4 shrink-0" />
          </span>
        )}
      </span>
      {children && <span className={cn('min-w-0 truncate', hintFadeOut)}>{children}</span>}
    </>
  );

  if (!panelDrag) {
    return (
      <Button variant="ghost" className={className} aria-label={fallbackLabel}>
        {content}
      </Button>
    );
  }

  const CollapseIcon = isCollapsed ? ChevronsLeftRightIcon : ChevronsRightLeftIcon;

  return (
    <>
      <ReorderHandle
        ref={panelDrag.registerHandle}
        id={panelDrag.panelId}
        name={name}
        index={panelDrag.index}
        total={panelDrag.total}
        orientation="horizontal"
        onMove={panelDrag.onMove}
        onClick={panelDrag.onToggleCollapsed}
        menuItems={
          <DropdownMenuItem onClick={panelDrag.onToggleCollapsed}>
            <CollapseIcon />
            {t(isCollapsed ? 'c:expand' : 'c:collapse')}
          </DropdownMenuItem>
        }
        className={cn(buttonVariants({ variant: 'ghost' }), className, 'group/drag cursor-grab active:cursor-grabbing')}
      >
        {content}
      </ReorderHandle>
      {/* Windows fades a drag preview wider than 280px */}
      {panelDrag.previewContainer && createPortal(<div className="max-w-64">{preview ?? <Chip>{name}</Chip>}</div>, panelDrag.previewContainer)}
    </>
  );
}
