import { useEffect, useRef } from 'react';

const FocusTrap = ({ children, mainElementId, active = true }: { children: React.ReactNode; mainElementId?: string; active?: boolean }) => {
  const focusTrapRef = useRef<HTMLDivElement | null>(null);

  const handleTabKey = (e: KeyboardEvent) => {
    if (!focusTrapRef || !focusTrapRef.current) return;
    const focusableElements = focusTrapRef.current.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])');
    const firstElement = focusableElements[0] as HTMLElement | undefined;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement | undefined;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        lastElement?.focus();
        e.preventDefault();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        firstElement?.focus();
        e.preventDefault();
      }
    }
  };

  const handleEscKey = (id: string) => {
    const mainElement = document.getElementById(id);
    if (!mainElement || document.activeElement === mainElement) return;
    mainElement.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') handleTabKey(e);
    if (e.key === 'Escape' && mainElementId) handleEscKey(mainElementId);
  };

  useEffect(() => {
    if (!active) return;
    const trap = focusTrapRef.current;
    if (!trap) return;
    trap.addEventListener('keydown', handleKeyDown);
    return () => {
      trap.removeEventListener('keydown', handleKeyDown);
    };
  }, [active]);

  return (
    <div ref={focusTrapRef} tabIndex={-1}>
      {children}
    </div>
  );
};

export default FocusTrap;
