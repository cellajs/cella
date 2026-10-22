import { type CSSProperties, type FocusEventHandler, type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { isTouchInteraction } from '~/utils/input-modality';

const candidateSelector = 'a[href], button, textarea, input, select, [tabindex], [contenteditable="true"]';

const guardStyle: CSSProperties = {
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

/** Focusable elements in a container, using the DOM tabIndex property as ground truth. */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(candidateSelector);
  return Array.from(candidates).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.closest('[aria-hidden="true"]') &&
      element.getAttribute('data-exclude-from-focus-trap') !== 'true' &&
      !element.hasAttribute('data-focus-guard'),
  );
}

interface FocusGuardProps {
  onFocus: FocusEventHandler;
}

/** Visually-hidden sentinel that redirects focus back into the trap */
function FocusGuard({ onFocus }: FocusGuardProps) {
  // biome-ignore lint/a11y/noNoninteractiveTabindex: sentinel guard must be tabbable so a Tab/Shift+Tab off the trap edge moves focus here and can be redirected back inside
  return <span tabIndex={0} onFocus={onFocus} aria-hidden data-focus-guard="" style={guardStyle} />;
}

interface FocusTrapProps {
  children: ReactNode;
  active?: boolean;
  /** Move focus into the trap when activated (true = first element, or the trap itself after touch; ref = specific element) */
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  /** Restore focus to the earlier focused element on deactivation. */
  returnFocus?: boolean;
  /** Pull focus back inside when it escapes via click or programmatic move */
  containFocus?: boolean;
}

export function FocusTrap({ children, active = true, initialFocus = false, returnFocus = false, containFocus = false }: FocusTrapProps) {
  const trapRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!active) return;
    const trap = trapRef.current;
    if (!trap) return;

    if (returnFocus && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    if (initialFocus) {
      queueMicrotask(() => {
        if (trap.contains(document.activeElement) && document.activeElement !== trap) return;
        // preventScroll: portaled content may still sit at (0,0), so focus would jump the page to the top
        if (typeof initialFocus === 'object' && initialFocus.current) {
          initialFocus.current.focus({ preventScroll: true });
          return;
        }
        // A `data-autofocus` element wins, so a confirmation can start on its safe option.
        const preferred = trap.querySelector<HTMLElement>('[data-autofocus]');
        // After touch the first element may be a text field, whose focus opens the on-screen keyboard.
        const first = isTouchInteraction() ? trap : getFocusableElements(trap)[0];
        (preferred ?? first ?? trap).focus({ preventScroll: true });
      });
    }

    if (!returnFocus) return;
    return () => {
      const element = previousFocusRef.current;
      if (element?.isConnected) queueMicrotask(() => element.focus({ preventScroll: true }));
      previousFocusRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !containFocus) return;
    const trap = trapRef.current;
    if (!trap) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || trap.contains(target) || target.hasAttribute('data-focus-guard')) return;
      const focusable = getFocusableElements(trap);
      // preventScroll: the redirect is involuntary and must not scroll off-screen content into view
      (focusable[0] ?? trap).focus({ preventScroll: true });
    };

    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [active, containFocus]);

  // Prevent Tab from escaping a trap with no focusable elements
  useEffect(() => {
    if (!active) return;
    const trap = trapRef.current;
    if (!trap) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && getFocusableElements(trap).length === 0) event.preventDefault();
    };

    trap.addEventListener('keydown', onKeyDown);
    return () => trap.removeEventListener('keydown', onKeyDown);
  }, [active]);

  // `relatedTarget` tells a Tab off one edge (wrap to the other edge) from focus entering the trap (go to the guard's own edge)
  const focusFromGuard = (relatedTarget: EventTarget | null, guard: 'before' | 'after') => {
    const trap = trapRef.current;
    if (!trap) return;
    const cameFromInside = relatedTarget instanceof Node && trap.contains(relatedTarget);
    const focusable = getFocusableElements(trap);
    const first = focusable[0] ?? trap;
    const last = focusable.at(-1) ?? trap;
    if (guard === 'before') (cameFromInside ? last : first).focus();
    else (cameFromInside ? first : last).focus();
  };

  return (
    <div ref={trapRef} tabIndex={-1}>
      {active && <FocusGuard onFocus={(event) => focusFromGuard(event.relatedTarget, 'before')} />}
      {children}
      {active && <FocusGuard onFocus={(event) => focusFromGuard(event.relatedTarget, 'after')} />}
    </div>
  );
}
