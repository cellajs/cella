import { useState } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';

interface UseCloseOnEscapeOptions<Details> {
  /** Controlled state: the caller then handles Escape itself. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, eventDetails: Details) => void;
}

/**
 * Open state for hover content (a tooltip, a hover card) that Escape closes from anywhere, so it can be dismissed
 * without moving the pointer or focus (WCAG 1.4.13). Base UI closes it only while no dialog or sheet holds the
 * keyboard: those stop the key before it bubbles, which is why this listens in the capture phase.
 */
export function useCloseOnEscape<Details>({ open, defaultOpen = false, onOpenChange }: UseCloseOnEscapeOptions<Details>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = open !== undefined;

  useEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') setUncontrolledOpen(false);
    },
    { enabled: !controlled && uncontrolledOpen, capture: true },
  );

  const handleOpenChange = (nextOpen: boolean, eventDetails: Details) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen, eventDetails);
  };

  return { open: controlled ? open : uncontrolledOpen, onOpenChange: handleOpenChange };
}
