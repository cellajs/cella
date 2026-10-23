import { GripVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePanelDragHandle } from '~/modules/common/board/board-drag';
import { hintFadeOut } from '~/modules/common/resizable-panels/resizable-panels';
import { Button } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
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
 * A panel header button wired as a keyboard-accessible drag handle from the board's drag context (null when the
 * board is not reorderable). On hover the `icon` cross-fades to a drag grip.
 */
export function PanelDragHandleButton({ name, fallbackLabel, className, icon, preview, children }: PanelDragHandleButtonProps) {
  const { t } = useTranslation();
  const panelDrag = usePanelDragHandle();

  return (
    <>
      <Button
        variant="ghost"
        ref={panelDrag?.registerHandle}
        className={cn(className, panelDrag && 'group/drag cursor-grab active:cursor-grabbing')}
        aria-roledescription={panelDrag ? t('c:sortable') : undefined}
        aria-label={panelDrag ? t('c:sortable_position', { name, position: panelDrag.index + 1, total: panelDrag.total }) : fallbackLabel}
        onKeyDown={panelDrag?.onKeyDown}
        onClick={panelDrag?.onToggleCollapsed}
      >
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
      </Button>
      {/* Windows fades a drag preview wider than 280px */}
      {panelDrag?.previewContainer && createPortal(<div className="max-w-64">{preview ?? <Chip>{name}</Chip>}</div>, panelDrag.previewContainer)}
    </>
  );
}
