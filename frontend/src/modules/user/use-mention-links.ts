import { type RefObject, useEffect } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';

/**
 * Turns the mentions of a body rendered from HTML into links to their user's sheet, opened by a click or Enter. Takes the
 * HTML the element holds, so mentions a later render sets in are marked too.
 */
export function useMentionLinks(ref: RefObject<HTMLElement | null>, html: string) {
  const openUserSheet = useOpenUserSheet();
  const openRef = useLatestRef(openUserSheet);

  useEffect(() => {
    const element = ref.current;
    if (!element || !html) return;

    for (const mention of element.querySelectorAll<HTMLElement>('[data-mention-id]')) {
      mention.setAttribute('role', 'link');
      mention.tabIndex = 0;
      mention.classList.add('focus-effect');
    }

    // Delegated, as the mentions are plain HTML; it stops the event, so the card or media preview around it does not act too.
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
      const mention = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-mention-id]') : null;
      const userId = mention?.dataset.mentionId;
      if (!userId || !element.contains(mention)) return;
      event.preventDefault();
      event.stopPropagation();
      openRef.current(userId);
    };

    element.addEventListener('click', open);
    element.addEventListener('keydown', open);
    return () => {
      element.removeEventListener('click', open);
      element.removeEventListener('keydown', open);
    };
  }, [ref, html, openRef]);
}
