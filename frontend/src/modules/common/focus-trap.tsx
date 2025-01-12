import { useEffect, useRef } from 'react';

const FocusTrap = ({ children, mainElementId, active = true }: { children: React.ReactNode; mainElementId?: string; active?: boolean }) => {
  const focusTrapRef = useRef<HTMLDivElement | null>(null);

  const handleTabKey = (e: KeyboardEvent) => {
    if (!focusTrapRef || !focusTrapRef.current) return;
    // Get all focusable elements
    const focusableElements = focusTrapRef.current.querySelectorAll(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"]):not([data-exclude-from-focus-trap="true"])',
    );
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
    const focusableElements = trap.querySelectorAll(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"]):not([data-exclude-from-focus-trap="true"])',
    );
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
};

export default FocusTrap;
