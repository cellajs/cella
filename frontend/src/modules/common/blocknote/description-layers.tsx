import { type ComponentProps, type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';
import type { InPlaceDescription } from '~/modules/common/blocknote/use-in-place-description';
import { cn } from '~/utils/cn';

/**
 * Holds the content's last non-empty height on its holder while the content is empty for a moment, as when the editor
 * swaps for the static description: what surrounds it does not reflow. It sets only a min-height, outside React state,
 * and drops it once the content stays empty: an empty description settles to its natural size.
 */
function usePreservedHeight(holderRef: RefObject<HTMLElement | null>, contentRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const holder = holderRef.current;
    const content = contentRef.current;
    if (!holder || !content) return;

    let releaseTimer = 0;
    const hasContent = () => (content.textContent?.trim().length ?? 0) > 0 || content.querySelector('img, svg') !== null;

    // The height comes from the observer's entry, never from offsetHeight: a board mounts dozens of these in one commit,
    // and each read after the previous one's write would lay out the whole board again.
    const resizeObserver = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize[0];
      if (!box || !hasContent()) return;
      clearTimeout(releaseTimer);
      holder.style.minHeight = `${box.blockSize}px`;
    });
    resizeObserver.observe(content, { box: 'border-box' });
    const mutationObserver = new MutationObserver(() => {
      clearTimeout(releaseTimer);
      if (hasContent()) return;
      releaseTimer = window.setTimeout(() => {
        holder.style.minHeight = '';
      }, 150);
    });
    mutationObserver.observe(content, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(releaseTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [holderRef, contentRef]);
}

interface DescriptionLayersProps extends Omit<ComponentProps<'div'>, 'onClickCapture' | 'ref'> {
  inPlace: InPlaceDescription;
  /** The static view, given `inPlace.onStaticReady` as its `onReady` and `inPlace.staticOverride` where the app applies it. */
  staticView: ReactNode;
  /** The editor host, given `inPlace.apiRef` as its `contentApiRef` and `inPlace.onEditorReady`. */
  editor: ReactNode;
  /** Laid over the description, outside the layers and their click capture: an element positioned against the description's box. */
  children?: ReactNode;
}

/**
 * Stacks the two views of a description shown in place and holds its height across the swap. A warm editor overlays the static
 * invisibly; a held editor keeps the layout while the static renders invisibly under it. The other props go to the layers.
 */
export function DescriptionLayers({ inPlace, staticView, editor, className, children, ...props }: DescriptionLayersProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  usePreservedHeight(holderRef, layersRef);

  return (
    <div ref={holderRef} className="relative">
      <div {...props} ref={layersRef} className={cn('relative', className)} onClickCapture={inPlace.onClickCapture}>
        {inPlace.staticMounted && <div className={inPlace.holding ? 'invisible absolute inset-0' : undefined}>{staticView}</div>}
        {inPlace.editorMounted && <div className={inPlace.editorInFlow ? undefined : 'invisible absolute inset-0 overflow-hidden'}>{editor}</div>}
      </div>
      {children}
    </div>
  );
}
