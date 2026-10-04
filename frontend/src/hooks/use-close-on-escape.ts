import { useEffect } from 'react';

/**
 * Closes hover content (a tooltip, a hover card) on Escape from anywhere, so it can be dismissed without moving the
 * pointer or focus (WCAG 1.4.13). Base UI closes it only while no dialog or sheet holds the keyboard: those stop the
 * key before it bubbles, which is why this listens in the capture phase.
 */
export function useCloseOnEscape(isOpen: boolean, close: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, close]);
}
