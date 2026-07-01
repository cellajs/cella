import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

// Broad selector to find candidate focusable elements
const candidateSelector = 'a[href], button, textarea, input, select, [tabindex], [contenteditable="true"]';

const guardStyle: React.CSSProperties = {
  position: 'absolute',
  overflow: 'hidden',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  border: 0,
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
};

/** Get all focusable elements within a container using the DOM tabIndex property as ground truth */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(candidateSelector);
  return Array.from(candidates).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.closest('[aria-hidden="true"]') &&
      el.getAttribute('data-exclude-from-focus-trap') !== 'true' &&
      !el.hasAttribute('data-focus-guard'),
  );
}

/** Visually-hidden sentinel that redirects focus back into the trap */
function FocusGuard({ onFocus }: { onFocus: (e: React.FocusEvent) => void }) {
  // biome-ignore lint/a11y/noNoninteractiveTabindex: sentinel guard must be tabbable so a Tab/Shift+Tab off the trap edge lands here and can be redirected back inside
  return <span tabIndex={0} onFocus={onFocus} aria-hidden data-focus-guard="" style={guardStyle} />;
}

export function FocusTrap({
  children,
  mainElementId,
  active = true,
  disableInactive = true,
  initialFocus = false,
  returnFocus = false,
  containFocus = false,
}: {
  children: ReactNode;
  mainElementId?: string;
  active?: boolean;
  disableInactive?: boolean;
  /** Move focus into the trap when activated (true = first element, ref = specific element) */
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  /** Restore focus to the previously-focused element on deactivation */
  returnFocus?: boolean;
  /** Pull focus back inside when it escapes via click or programmatic move */
  containFocus?: boolean;
}) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  // Track elements we disabled so we can restore exactly those on re-activation
  const disabledRef = useRef<Set<HTMLElement>>(new Set());
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const getContainer = () => internalRef.current;

  // Initial focus + return focus
  useEffect(() => {
    if (!active) return;
    const trap = getContainer();
    if (!trap) return;

    // Capture before we move focus
    if (returnFocus && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    if (initialFocus) {
      queueMicrotask(() => {
        if (trap.contains(document.activeElement) && document.activeElement !== trap) return;
        if (typeof initialFocus === 'object' && initialFocus.current) {
          initialFocus.current.focus();
          return;
        }
        const focusable = getFocusableElements(trap);
        (focusable[0] ?? trap).focus();
      });
    }

    if (!returnFocus) return;
    return () => {
      const el = previousFocusRef.current;
      if (el?.isConnected) queueMicrotask(() => el.focus({ preventScroll: true }));
      previousFocusRef.current = null;
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus containment (click / programmatic escape)
  useEffect(() => {
    if (!active || !containFocus) return;
    const trap = getContainer();
    if (!trap) return;

    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!trap || !target || trap.contains(target)) return;
      if (target.hasAttribute('data-focus-guard')) return;
      const focusable = getFocusableElements(trap);
      (focusable[0] ?? trap).focus();
    }

    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [active, containFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape → main element
  useEffect(() => {
    if (!active || !mainElementId) return;
    const trap = getContainer();
    if (!trap) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const main = document.getElementById(mainElementId!);
        if (main && document.activeElement !== main) main.focus();
      }
    }

    trap.addEventListener('keydown', onKeyDown);
    return () => trap.removeEventListener('keydown', onKeyDown);
  }, [active, mainElementId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Empty-trap protection (prevent Tab from escaping when there are no focusable elements)
  useEffect(() => {
    if (!active) return;
    const trap = getContainer();
    if (!trap) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Tab' && getFocusableElements(trap!).length === 0) {
        e.preventDefault();
      }
    }

    trap.addEventListener('keydown', onKeyDown);
    return () => trap.removeEventListener('keydown', onKeyDown);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inactive: optionally remove children from tab order
  useEffect(() => {
    const trap = getContainer();
    if (!trap) return;

    if (active) {
      for (const el of disabledRef.current) el.setAttribute('tabindex', '0');
      disabledRef.current.clear();
      return;
    }

    if (!disableInactive) return;
    const focusable = getFocusableElements(trap);
    for (const el of focusable) {
      el.setAttribute('tabindex', '-1');
      disabledRef.current.add(el);
    }
  }, [active, disableInactive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sentinel focus handlers — use relatedTarget to distinguish cycling vs entering
  const handleBeforeGuardFocus = (e: React.FocusEvent) => {
    const trap = getContainer();
    if (!trap) return;
    const cameFromInside = e.relatedTarget instanceof Node && trap.contains(e.relatedTarget);
    const focusable = getFocusableElements(trap);
    if (cameFromInside) {
      // Shift+Tab from first element → wrap to last
      (focusable[focusable.length - 1] ?? trap).focus();
    } else {
      // Tabbing forward into trap from outside → land on first
      (focusable[0] ?? trap).focus();
    }
  };

  const handleAfterGuardFocus = (e: React.FocusEvent) => {
    const trap = getContainer();
    if (!trap) return;
    const cameFromInside = e.relatedTarget instanceof Node && trap.contains(e.relatedTarget);
    const focusable = getFocusableElements(trap);
    if (cameFromInside) {
      // Tab from last element → wrap to first
      (focusable[0] ?? trap).focus();
    } else {
      // Shift+Tab backward into trap from outside → land on last
      (focusable[focusable.length - 1] ?? trap).focus();
    }
  };

  return (
    <div ref={internalRef} tabIndex={-1}>
      {active && <FocusGuard onFocus={handleBeforeGuardFocus} />}
      {children}
      {active && <FocusGuard onFocus={handleAfterGuardFocus} />}
    </div>
  );
}
