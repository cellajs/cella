import { useEffect, useRef } from 'react';

// Selector for focusable elements, excluding aria-hidden elements (e.g. Base UI's
// hidden checkbox <input>) which must never enter the tab order.
const notHidden = ':not([aria-hidden="true"])';
const focusableSelector = [
  `a[href]${notHidden}`,
  `button${notHidden}`,
  `textarea${notHidden}`,
  `input${notHidden}`,
  `select${notHidden}`,
  `[tabindex]${notHidden}:not([tabindex="-1"]):not([data-exclude-from-focus-trap="true"])`,
].join(', ');

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

  const handleTabKey = (e: KeyboardEvent) => {
    if (!focusTrapRef || !focusTrapRef.current) return;
    // Get all focusable elements
    const focusableElements = focusTrapRef.current.querySelectorAll(focusableSelector);
    const firstElement = focusableElements[0] as HTMLElement | undefined;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement | undefined;

    // Shift + Tab
    if (e.shiftKey && document.activeElement === firstElement) {
      lastElement?.focus();
      e.preventDefault();
    }
    // Tab
    if (!e.shiftKey && document.activeElement === lastElement) {
      firstElement?.focus();
      e.preventDefault();
    }
  };

  const handleEscKey = (id: string) => {
    const mainElement = document.getElementById(id);
    if (!mainElement || document.activeElement === mainElement) return;
    mainElement.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' && e.key !== 'Escape') return;
    switch (e.key) {
      case 'Tab':
        handleTabKey(e);
        break;
      case 'Escape':
        if (mainElementId) handleEscKey(mainElementId);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const trap = focusTrapRef.current;
    if (!trap) return;

    // Get all focusable elements
    const focusableElements = trap.querySelectorAll(focusableSelector);
    // Update tabindex based on the active state
    for (const element of focusableElements) element.setAttribute('tabindex', active ? '0' : '-1');

    if (active) {
      trap.addEventListener('keydown', handleKeyDown);
      return () => trap.removeEventListener('keydown', handleKeyDown);
    }
  }, [active]);

  return (
    <div ref={focusTrapRef} tabIndex={-1}>
      {children}
    </div>
  );
}
