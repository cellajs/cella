import type { ReactNode } from 'react';
import { create } from 'zustand';
import { type TriggerRef, withDefaults } from '~/modules/common/overlay-store-helpers';

export type DropdownKind = 'menu' | 'panel';

export type DropdownData = {
  id: number | string;
  triggerId: string;
  triggerRef: TriggerRef;
  align?: 'start' | 'center' | 'end';
  /**
   * 'menu' uses Base UI's Menu primitive (roving focus, arrow keys, typeahead); 'panel' uses a
   * Popover with a focus trap for arbitrary content. Defaults to 'panel'.
   */
  kind?: DropdownKind;
  /** Bypass the 300ms "reopen with same triggerId" guard, for openers with no click to debounce. */
  programmatic?: boolean;
  /** Extra classes merged onto a 'menu' popup, e.g. to widen its default min-width. */
  popupClassName?: string;
  /** Runs once when this dropdown leaves the screen: dismissed, toggled closed by its trigger, or replaced by another. */
  onClose?: () => void;
};

export type InternalDropdown = DropdownData & {
  key: number;
  content: ReactNode;
  /** The trigger's accessible name at open time; names the mobile drawer that stands in for the dropdown. */
  triggerLabel?: string;
  align: 'start' | 'center' | 'end';
  kind: DropdownKind;
};

/** How long (ms) a trigger shows that the action picked from its dropdown worked. */
const doneDuration = 1400;

interface DropdownStoreState {
  dropdown: InternalDropdown | null;
  lastRemovedTriggerId: string | null;
  lastRemovedAt: number;
  /** The trigger of a dropdown closed by an action that worked, e.g. a copy, and what to confirm there. */
  done: { trigger: HTMLElement; label: string; open: boolean; key: number } | null;

  create: (content: ReactNode, data: DropdownData) => string | number;
  update: (updates: Partial<InternalDropdown>) => void;
  remove: () => void;
  /** Closes the dropdown after the action picked from it worked: its trigger shows a check and a `label` tip for a moment. */
  complete: (label: string) => void;
  get: () => InternalDropdown | null;
}

let doneTimer: ReturnType<typeof setTimeout> | undefined;

/** Keeps the mark with `open: false`, so the tip can animate out from its trigger. */
function endDone() {
  clearTimeout(doneTimer);
  const { done } = useDropdowner.getState();
  if (!done?.open) return;
  done.trigger.removeAttribute('data-dropdowner-done');
  useDropdowner.setState({ done: { ...done, open: false } });
}

function markDone(trigger: HTMLElement, label: string) {
  endDone();
  trigger.setAttribute('data-dropdowner-done', '');
  useDropdowner.setState({ done: { trigger, label, open: true, key: Date.now() } });
  doneTimer = setTimeout(endDone, doneDuration);
}

export const useDropdowner = create<DropdownStoreState>((set, get) => ({
  dropdown: null,
  lastRemovedTriggerId: null,
  lastRemovedAt: 0,
  done: null,

  create: (content, data) => {
    const current = get().dropdown;

    endDone();
    current?.triggerRef.current?.removeAttribute('data-dropdowner-active');

    // The same trigger toggles the dropdown closed
    if (current?.triggerId === data.triggerId) {
      get().remove();
      return data.id;
    }

    // Suppress click-trigger reopen races immediately after dismissal
    if (!data.programmatic) {
      const { lastRemovedTriggerId, lastRemovedAt } = get();
      if (lastRemovedTriggerId === data.triggerId && Date.now() - lastRemovedAt < 300) {
        set({ lastRemovedTriggerId: null });
        return data.id;
      }
    }

    data.triggerRef.current?.setAttribute('data-dropdowner-active', '');

    // Blur active element to prevent aria-hidden conflict when modal sets aria-hidden on ancestors
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const defaults: Pick<InternalDropdown, 'align' | 'kind'> = { align: 'start', kind: 'panel' };
    const trigger = data.triggerRef.current;
    const triggerLabel = trigger?.getAttribute('aria-label') || trigger?.textContent?.trim() || undefined;
    set({ dropdown: { ...withDefaults(defaults, data), content, triggerLabel, key: Date.now() } });
    current?.onClose?.();

    return data.id;
  },

  update: (updates) => {
    const current = get().dropdown;
    if (!current) return;

    set({ dropdown: { ...current, ...updates } });
  },

  remove: () => {
    const current = get().dropdown;
    current?.triggerRef.current?.removeAttribute('data-dropdowner-active');
    set({ dropdown: null, lastRemovedTriggerId: current?.triggerId ?? null, lastRemovedAt: Date.now() });
    current?.onClose?.();
  },

  complete: (label) => {
    const trigger = get().dropdown?.triggerRef.current;
    get().remove();
    if (trigger) markDone(trigger, label);
  },

  get: () => get().dropdown,
}));

/** Closes the dropdown unless it was already swapped for another (e.g. a menu item opening a confirmation panel). */
export function removeIfCurrent(key: number) {
  if (useDropdowner.getState().dropdown?.key === key) useDropdowner.getState().remove();
}

/** Whether a dropdown is open: an overlay under it then ignores outside presses, which belong to the dropdown. */
export const isDropdownOpen = () => !!useDropdowner.getState().dropdown;

export { useDropdowner as dropdowner };
