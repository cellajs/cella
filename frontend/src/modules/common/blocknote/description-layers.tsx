import type { ComponentProps, ReactNode } from 'react';
import type { DescriptionSlot } from '~/modules/common/blocknote/use-description-slot';
import { PreserveDescriptionHeight } from '~/modules/common/preserve-description-height';
import { cn } from '~/utils/cn';

interface DescriptionLayersProps extends Omit<ComponentProps<'div'>, 'children' | 'onClickCapture' | 'slot'> {
  slot: DescriptionSlot;
  /** The static view, given `slot.onStaticReady` as its `onReady` and `slot.staticOverride` where the app applies it. */
  staticView: ReactNode;
  /** The editor host, given `slot.apiRef` as its `contentApiRef` and `slot.onEditorReady`. */
  editor: ReactNode;
}

/**
 * Stacks a description slot's two views and holds its height across the swap. A warm editor overlays the static
 * invisibly; a held editor keeps the layout while the static renders invisibly under it.
 */
export function DescriptionLayers({ slot, staticView, editor, className, ...props }: DescriptionLayersProps) {
  return (
    <PreserveDescriptionHeight>
      <div {...props} className={cn('relative', className)} onClickCapture={slot.onClickCapture}>
        {slot.staticMounted && <div className={slot.holding ? 'invisible absolute inset-0' : undefined}>{staticView}</div>}
        {slot.editorMounted && <div className={slot.editorInFlow ? undefined : 'invisible absolute inset-0 overflow-hidden'}>{editor}</div>}
      </div>
    </PreserveDescriptionHeight>
  );
}
