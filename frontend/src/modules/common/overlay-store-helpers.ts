import { type RefObject, useEffect, useRef } from 'react';
import { asRecord } from 'shared/utils/as-record';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useUIStore } from '~/modules/ui/ui-store';
import { getRouter } from '~/routes/-router-instance';
import { fallbackContentRef } from '~/utils/fallback-content-ref';
import { isTouchInteraction } from '~/utils/input-modality';

/** Element focus returns to on close; read when the overlay closes, so a ref may resolve to a later DOM node. */
export type TriggerRef = RefObject<HTMLElement | null>;

type Closable = { onClose?: (isCleanup?: boolean) => void };

/** What Base UI passes to a store overlay's `onOpenChange`: store overlays have no Base UI trigger, so it only reports closes. */
export type OverlayCloseDetails = { reason: string; event?: Event };

/** Spreads `data` over `defaults`, skipping undefined values: an option passed as undefined keeps its default. */
export function withDefaults<D extends object, T extends object>(defaults: D, data: T): D & T {
  const merged = { ...asRecord(defaults) };
  for (const [key, value] of Object.entries(data)) if (value !== undefined) merged[key] = value;
  return merged as D & T;
}

export function updateById<T extends { id: unknown }>(items: T[], id: T['id'], updates: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...updates } : item));
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
 * The `initialFocus` of an overlay opened from code, which Base UI cannot see as a touch open: on touch the popup
 * takes focus, as Base UI's own touch default does. Otherwise a `data-autofocus` element wins, so a confirmation
 * starts on its safe option.
 */
export function touchInitialFocus(popupRef: RefObject<HTMLElement | null>) {
  return () => (isTouchInteraction() ? popupRef.current : (popupRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? true));
}

/**
 * `finalFocus` of the overlay with element id `popupId`, resolved once its exit ends: a trigger inside a grid is
 * replaced by a new node once cell edit mode ends. Focus that left the overlay while it slid out (a focus bridge, the
 * page after a route change) stays where it went.
 */
export function finalFocusFor(triggerRef: TriggerRef | undefined, popupId: string) {
  if (!triggerRef) return undefined;
  return () => {
    const active = document.activeElement;
    if (active && active !== document.body && !document.getElementById(popupId)?.contains(active)) return false;
    return triggerRef.current ?? true;
  };
}

/**
 * Lets a user-dismissed overlay play its exit animation: `close` runs `hide` (set `open: false`) and the entry is
 * removed when Base UI reports the overlay closed. Pass `onOpenChangeComplete` to the Base UI root. Closes made
 * through the store (`update`, `remove`, route changes) do not pass through it.
 */
export function useRemoveAfterExit(hide: () => void, remove: () => void) {
  const pendingRemovalRef = useRef(false);
  const removeRef = useLatestRef(remove);

  // Unmounting mid-exit (e.g. a breakpoint switch remounts the overlay) must not strand the closed entry.
  useEffect(
    () => () => {
      if (pendingRemovalRef.current) removeRef.current();
    },
    [],
  );

  const close = () => {
    pendingRemovalRef.current = true;
    hide();
  };

  const onOpenChangeComplete = (isOpen: boolean) => {
    if (isOpen) pendingRemovalRef.current = false;
    else if (pendingRemovalRef.current) {
      pendingRemovalRef.current = false;
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

/** Runs `callback` when a navigation to another path starts. */
export function useOnPathChange(callback: () => void) {
  const callbackRef = useLatestRef(callback);

  useEffect(
    () =>
      getRouter().subscribe('onBeforeLoad', ({ pathChanged }) => {
        if (pathChanged) callbackRef.current();
      }),
    [],
  );
}
