import { type RefObject, useEffect, useRef } from 'react';

const TYPEAHEAD_RESET_MS = 500;

/** Find all enabled menu items inside a container, in DOM order. */
function getMenuItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
  );
}

/** Apply roving tabindex: only `activeIdx` is in the tab order so Tab moves out of the menu. */
function applyRovingTabindex(items: HTMLElement[], activeIdx: number) {
  for (let i = 0; i < items.length; i++) {
    items[i].tabIndex = i === activeIdx ? 0 : -1;
  }
}

function focusItem(items: HTMLElement[], idx: number) {
  const item = items[idx];
  if (!item) return;
  applyRovingTabindex(items, idx);
  item.focus({ preventScroll: true });
  item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Adds WAI-ARIA menu keyboard nav to a container of `[role="menuitem"]` elements: roving tabindex (only one
 * item tabbable, so Tab leaves the menu), Arrow/Home/End movement, and printable-char typeahead. Items keep
 * their own click/Enter/Space activation. Safe to call unconditionally; it is a no-op without menuitems.
 */
export function useMenuKeyNav(containerRef: RefObject<HTMLElement | null>) {
  const typeaheadRef = useRef({ buffer: '', timer: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initialItems = getMenuItems(container);
    if (initialItems.length === 0) return; // not a menu, leave focus handling to FocusTrap

    // Set up roving tabindex so Tab moves out of the menu and FocusTrap.initialFocus
    // lands on the first item and does not skip every -1 element.
    applyRovingTabindex(initialItems, 0);

    // Focus the first item after competing focus managers settle so arrow navigation has a target.
    const focusTimer = window.setTimeout(() => {
      const items = getMenuItems(container);
      if (items.length > 0 && !items.includes(document.activeElement as HTMLElement)) {
        focusItem(items, 0);
      }
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      // Skip typing contexts. Only one dropdowner menu can be open at a time,
      // so we don't need to gate by focus location; if a text field is the
      // target the user is typing into it, not navigating the menu.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      const items = getMenuItems(container);
      if (items.length === 0) return;

      const active = document.activeElement as HTMLElement | null;
      const currentIdx = active ? items.indexOf(active) : -1;

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const next = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
          focusItem(items, next);
          return;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prev = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
          focusItem(items, prev);
          return;
        }
        case 'Home': {
          event.preventDefault();
          focusItem(items, 0);
          return;
        }
        case 'End': {
          event.preventDefault();
          focusItem(items, items.length - 1);
          return;
        }
        default:
          break;
      }

      // Typeahead: single printable character (length === 1 filters arrows, F-keys, etc.)
      if (event.key.length !== 1) return;

      const state = typeaheadRef.current;
      window.clearTimeout(state.timer);
      state.buffer = (state.buffer + event.key).toLowerCase();
      state.timer = window.setTimeout(() => {
        state.buffer = '';
      }, TYPEAHEAD_RESET_MS);

      // Search starting from the item after the current one so repeated keystrokes cycle
      const start = currentIdx < 0 ? 0 : currentIdx + (state.buffer.length === 1 ? 1 : 0);
      const ordered = items.slice(start).concat(items.slice(0, start));
      const match = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(state.buffer));
      if (match) {
        event.preventDefault();
        focusItem(items, items.indexOf(match));
      }
    };

    // Keep roving tabindex in sync when focus moves via mouse or programmatically.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const items = getMenuItems(container);
      const idx = items.indexOf(target);
      if (idx >= 0) applyRovingTabindex(items, idx);
    };

    container.addEventListener('focusin', onFocusIn);
    // Document-level keydown in CAPTURE phase so neither the Base UI popup nor
    // FocusTrap can stopPropagation on us before we see the key. Only one
    // dropdowner menu is open at a time, so this is safe.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown, true);
      container.removeEventListener('focusin', onFocusIn);
      window.clearTimeout(typeaheadRef.current.timer);
    };
  }, [containerRef]);
}
