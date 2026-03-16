import { useEffect, useRef } from 'react';

// Broad selector to find candidate focusable elements
const candidateSelector = 'a[href], button, textarea, input, select, [tabindex], [contenteditable="true"]';

/** Get all focusable elements within a container using the DOM tabIndex property as ground truth */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(candidateSelector);
  return Array.from(candidates).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[aria-hidden="true"]') &&
      el.getAttribute('data-exclude-from-focus-trap') !== 'true',
  );
}

export function FocusTrap({
  children,
  mainElementId,
  active = true,
}: {
  children: React.ReactNode;
  mainElementId?: string;
  active?: boolean;
}) {
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  // Track elements we disabled so we can restore exactly those on re-activation
  const disabledRef = useRef<Set<HTMLElement>>(new Set());

  useEffect(() => {
    const trap = focusTrapRef.current;
    if (!trap) return;

    if (active) {
      // Restore elements we previously disabled
      for (const el of disabledRef.current) el.setAttribute('tabindex', '0');
      disabledRef.current.clear();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          // Query focusable elements at press time so dynamically added elements are included
          const focusable = getFocusableElements(trap);
          if (!focusable.length) return;

          const first = focusable[0];
          const last = focusable[focusable.length - 1];

          if (e.shiftKey && document.activeElement === first) {
            last.focus();
            e.preventDefault();
          } else if (!e.shiftKey && document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        } else if (e.key === 'Escape' && mainElementId) {
          const main = document.getElementById(mainElementId);
          if (main && document.activeElement !== main) main.focus();
        }
      };

      trap.addEventListener('keydown', handleKeyDown);
      return () => trap.removeEventListener('keydown', handleKeyDown);
    }

    // Inactive: remove focusable children from the tab order
    const focusable = getFocusableElements(trap);
    for (const el of focusable) {
      el.setAttribute('tabindex', '-1');
      disabledRef.current.add(el);
    }
  }, [active, mainElementId]);

  return (
    <div ref={focusTrapRef} tabIndex={-1}>
      {children}
    </div>
  );
}
