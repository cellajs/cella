import type { ComponentProps, ReactNode } from 'react';
import type { InPlaceDescription } from '~/modules/common/blocknote/use-in-place-description';
import { PreserveDescriptionHeight } from '~/modules/common/preserve-description-height';
import { cn } from '~/utils/cn';

interface DescriptionLayersProps extends Omit<ComponentProps<'div'>, 'children' | 'onClickCapture'> {
  inPlace: InPlaceDescription;
  /** The static view, given `inPlace.onStaticReady` as its `onReady` and `inPlace.staticOverride` where the app applies it. */
  staticView: ReactNode;
  /** The editor host, given `inPlace.apiRef` as its `contentApiRef` and `inPlace.onEditorReady`. */
  editor: ReactNode;
}

/**
 * Stacks the two views of a description shown in place and holds its height across the swap. A warm editor overlays the static
 * invisibly; a held editor keeps the layout while the static renders invisibly under it.
 */
export function DescriptionLayers({ inPlace, staticView, editor, className, ...props }: DescriptionLayersProps) {
  return (
    <PreserveDescriptionHeight>
      <div {...props} className={cn('relative', className)} onClickCapture={inPlace.onClickCapture}>
        {inPlace.staticMounted && <div className={inPlace.holding ? 'invisible absolute inset-0' : undefined}>{staticView}</div>}
        {inPlace.editorMounted && <div className={inPlace.editorInFlow ? undefined : 'invisible absolute inset-0 overflow-hidden'}>{editor}</div>}
      </div>
    </PreserveDescriptionHeight>
  );
}
