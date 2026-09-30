import { useEffect } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

type Closable = { onClose?: (isCleanup?: boolean) => void };

/** Blurs a focused button or link and keeps it as the focus fallback: a modal sets aria-hidden on its ancestors. */
export function blurAndStashTrigger() {
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement)) return;
  fallbackContentRef.current = active;
  active.blur();
}

/**
 * Commits `items` without `toRemove`, then runs their onClose. The store updates first: a callback that
 * navigates from inside set() would interleave a router update with this one and render a stale frame.
 */
export function removeAndNotify<T extends Closable>(
  commit: (remaining: T[]) => void,
  items: T[],
  toRemove: T[],
  opts?: { isCleanup?: boolean },
) {
  if (!toRemove.length) return;
  commit(items.filter((item) => !toRemove.includes(item)));
  for (const item of toRemove) item.onClose?.(opts?.isCleanup);
}

/** Locks the UI for `source` while an overlay of that kind is open. */
export function useOverlayLock(source: string, active: boolean) {
  const lockUI = useUIStore((state) => state.lockUI);
  const unlockUI = useUIStore((state) => state.unlockUI);

  useEffect(() => {
    if (!active) return;
    lockUI(source);
    return () => unlockUI(source);
  }, [active]);
}
