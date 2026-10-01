import { useEffect, useRef } from 'react';
import { asRecord } from 'shared/utils/as-record';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useUIStore } from '~/modules/ui/ui-store';
import { fallbackContentRef } from '~/utils/fallback-content-ref';

type Closable = { onClose?: (isCleanup?: boolean) => void };

/** Spreads `data` over `defaults`, skipping undefined values: an option passed as undefined keeps its default. */
export function withDefaults<D extends object, T extends object>(defaults: D, data: T): D & T {
  const merged = { ...asRecord(defaults) };
  for (const [key, value] of Object.entries(data)) if (value !== undefined) merged[key] = value;
  return merged as D & T;
}

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
export function removeAndNotify<T extends Closable>(commit: (remaining: T[]) => void, items: T[], toRemove: T[], opts?: { isCleanup?: boolean }) {
  if (!toRemove.length) return;
  commit(items.filter((item) => !toRemove.includes(item)));
  for (const item of toRemove) item.onClose?.(opts?.isCleanup);
}

/**
 * Lets a user-dismissed overlay play its exit animation: `close` runs `hide` (set `open: false`) and the entry is
 * removed when Base UI reports the overlay closed. Pass `onOpenChangeComplete` to the Base UI root. Closes made
 * through the store (`update`, `remove`, route changes) behave as before.
 */
export function useRemoveAfterExit(hide: () => void, remove: () => void) {
  const pendingRemoval = useRef(false);
  const removeRef = useLatestRef(remove);

  // Unmounting mid-exit (e.g. a breakpoint switch remounts the overlay) must not strand the closed entry.
  useEffect(
    () => () => {
      if (pendingRemoval.current) removeRef.current();
    },
    [],
  );

  const close = () => {
    pendingRemoval.current = true;
    hide();
  };

  const onOpenChangeComplete = (isOpen: boolean) => {
    if (isOpen) pendingRemoval.current = false;
    else if (pendingRemoval.current) {
      pendingRemoval.current = false;
      remove();
    }
  };

  return { close, onOpenChangeComplete };
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
