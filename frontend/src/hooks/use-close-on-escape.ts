import { useEffect, useState } from 'react';

interface UseCloseOnEscapeOptions<Details> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, eventDetails: Details) => void;
}

/**
 * Open state for hover content (a tooltip, a hover card) that Escape closes from anywhere, so it can be dismissed
 * without moving the pointer or focus (WCAG 1.4.13). Base UI closes it only while no dialog or sheet holds the
 * keyboard: those stop the key before it bubbles, which is why this listens in the capture phase. A caller that
 * controls `open` handles Escape itself.
 */
export function useCloseOnEscape<Details>({ open, defaultOpen = false, onOpenChange }: UseCloseOnEscapeOptions<Details>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = open !== undefined;

  useEffect(() => {
    if (controlled || !uncontrolledOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUncontrolledOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [controlled, uncontrolledOpen]);

  const handleOpenChange = (nextOpen: boolean, eventDetails: Details) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen, eventDetails);
  };

  return { open: controlled ? open : uncontrolledOpen, onOpenChange: handleOpenChange };
}
