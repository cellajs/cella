import { useRef } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';

// Whoever carries one of these already explains itself on hover
const ownHoverText = '[title], [data-tooltip="true"], [data-slot="tooltip-trigger"]';

const isCut = (element: Element) => {
  const style = getComputedStyle(element);
  if (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth) return true;
  return style.webkitLineClamp !== 'none' && element.scrollHeight > element.clientHeight;
};

const findCutText = (target: Element) => {
  // A middle cut splits its text over two boxes: the whole text sits on their parent (MiddleCut)
  const middleCut = target.closest<HTMLElement>('[data-whole-text]');
  if (middleCut) return [...middleCut.children].some(isCut) ? { element: middleCut, text: middleCut.dataset.wholeText } : null;

  for (let element = target.closest<HTMLElement>('*:not(svg, svg *)'); element; element = element.parentElement) {
    if (isCut(element)) return { element, text: element.innerText.trim() };
  }
  return null;
};

/**
 * Gives text cut by `truncate`, `text-ellipsis`, `line-clamp-*` or MiddleCut its whole text as a native tooltip, only while it is
 * cut. The check runs on hover, so a cut element needs no `title` of its own. The title leaves with the pointer: a recycled
 * table row or a wider box never shows an outdated one.
 */
export function useCutTextTitle() {
  const titled = useRef<HTMLElement | null>(null);

  useEventListener(
    'mouseover',
    ({ target }) => {
      titled.current?.removeAttribute('title');
      titled.current = null;
      if (!(target instanceof Element) || target.closest(ownHoverText)) return;

      const cut = findCutText(target);
      if (!cut?.text) return;
      cut.element.title = cut.text;
      titled.current = cut.element;
    },
    { capture: true },
  );
}
