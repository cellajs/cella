import { type MouseEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import type { BlockNoteContentApi } from '~/modules/common/blocknote/blocknote-editor';

/** Upper bound on holding the outgoing editor while the static renders. */
const holdTimeoutMs = 250;
/** A warm reason not renewed for this long cools. */
const warmIdleMs = 30_000;
/** Warm editors per tab outside editing; the least recently warmed beyond this cool. */
const maxWarmSlots = 2;
/** The slot's own warm reason: a checklist toggle waiting for its editor. */
const toggleReason = 'toggle';

type Point = { x: number; y: number };

/** Where the cursor goes once the editor is live: a click point, or the end of the summary. */
type Cursor = Point | 'end';

/** The editor's content at a hand-off or toggle, with the description it replaced. */
type Handoff = { content: string; base: string | null };

/** Slots warm outside editing in this tab, least recently warmed first; each value cools its slot. */
const warmSlots = new Map<object, () => void>();

/** Registers a slot as the most recently warmed and cools the least recent ones beyond the cap. */
function registerWarmSlot(slot: object, cool: () => void) {
  warmSlots.delete(slot);
  warmSlots.set(slot, cool);
  for (const [other, coolOther] of warmSlots) {
    if (warmSlots.size <= maxWarmSlots) break;
    warmSlots.delete(other);
    coolOther();
  }
  return () => {
    warmSlots.delete(slot);
  };
}

/** Moves a registered slot to the most recently warmed end. */
function touchWarmSlot(slot: object) {
  const cool = warmSlots.get(slot);
  if (!cool) return;
  warmSlots.delete(slot);
  warmSlots.set(slot, cool);
}

interface DescriptionSlotOptions {
  /** Whether the editor is live; the app owns when editing starts and ends. */
  editing: boolean;
  /** Edit rights: without them nothing warms and the static takes no toggles. */
  canEdit: boolean;
  /** The cached description, which decides when the hand-off override drops. */
  description: string | null;
  /** Whether leaving editing holds the editor until the static is ready, read on that transition. Defaults to true. */
  holdOnExit?: boolean;
  /** Whether a text click places the cursor at its point: only where the static's layout matches the editor's. */
  cursorAtPoint?: boolean;
}

export interface DescriptionSlot {
  /** The editor's `contentApiRef`. */
  apiRef: RefObject<BlockNoteContentApi | null>;
  /** The editor's `onEditorReady`: a frame later, applies queued toggles, then the pending cursor. Stable. */
  onEditorReady: () => void;
  /** The static's `onReady`: releases the held editor. Stable. */
  onStaticReady: () => void;
  /** What the static shows over `description` after a hand-off or toggle, until the cache has it; the app picks the view. */
  staticOverride: string | undefined;
  /** Warms the editor behind the static for a reason; a reason not renewed within 30 s cools. Stable. */
  warm: (reason: string) => void;
  /** Releases a reason; the editor cools once none is left. Stable. */
  cool: (reason: string) => void;
  /** The slot's click capture: a checklist checkbox on the static toggles through the editor, a text click marks the cursor. Stable. */
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  /** Whether the editor renders: warm, editing or held. */
  editorMounted: boolean;
  /** Whether the editor takes the layout: editing or held. A warm one overlays the static invisibly. */
  editorInFlow: boolean;
  /** Whether the static renders: outside editing. */
  staticMounted: boolean;
  /** Whether the static renders invisibly under the held editor. */
  holding: boolean;
}

/**
 * The lifecycle of a description shown in place, with one editor instance: the static, the editor warmed invisibly
 * behind it, the live editor, and the hand-off back without a blink. The app owns `editing`, its warm triggers, how
 * editing ends and both views; `<DescriptionLayers>` stacks them. The hook cools idle editors itself: never without
 * edit rights, none in a hidden tab, a reason after 30 s idle, and at most two per tab outside editing. The slot places
 * and focuses the cursor itself, so its editor takes no `autoFocus`: that focuses the start after the slot's cursor.
 */
export function useDescriptionSlot({
  editing,
  canEdit,
  description,
  holdOnExit = true,
  cursorAtPoint = false,
}: DescriptionSlotOptions): DescriptionSlot {
  const [wasEditing, setWasEditing] = useState(editing);
  const [holding, setHolding] = useState(false);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [reasons, setReasons] = useState<ReadonlySet<string>>(() => new Set());
  const [slotKey] = useState(() => ({}));

  const apiRef = useRef<BlockNoteContentApi | null>(null);
  const pendingCursor = useRef<Cursor | null>(editing ? 'end' : null);
  // A text click's point, kept for an editing start in the same task.
  const clickPoint = useRef<Point | null>(null);
  const pendingToggles = useRef<string[]>([]);
  const idleTimers = useRef(new Map<string, number>());
  const latest = useLatestRef({ editing, canEdit, description, cursorAtPoint });

  // During render, so the editor never unmounts for a frame between the two views.
  if (wasEditing !== editing) {
    setWasEditing(editing);
    if (editing) {
      pendingCursor.current = clickPoint.current ?? 'end';
      setHandoff(null);
      setHolding(false);
    } else {
      pendingCursor.current = null;
      // The static shows the editor's content until the cache has it; a transition without a hold shows the cache.
      const content = holdOnExit ? apiRef.current?.getContent() : undefined;
      setHandoff(content !== undefined && content !== description ? { content, base: description } : null);
      setHolding(holdOnExit);
    }
  } else if (handoff && (description === handoff.content || description !== handoff.base)) {
    // The cache has the content, or moved past the value it replaced: a newer write, a rollback.
    setHandoff(null);
  }
  const staticOverride = handoff && description === handoff.base ? handoff.content : undefined;

  useEffect(() => {
    if (!holding) return;
    const timer = window.setTimeout(() => setHolding(false), holdTimeoutMs);
    return () => clearTimeout(timer);
  }, [holding]);

  const coolReasons = useCallback((drop: (reason: string) => boolean) => {
    for (const [reason, timer] of idleTimers.current) {
      if (!drop(reason)) continue;
      clearTimeout(timer);
      idleTimers.current.delete(reason);
    }
    if (drop(toggleReason)) pendingToggles.current = [];
    setReasons((current) => {
      const next = new Set([...current].filter((reason) => !drop(reason)));
      return next.size === current.size ? current : next;
    });
  }, []);

  const cool = useCallback((reason: string) => coolReasons((held) => held === reason), [coolReasons]);

  const warm = useCallback(
    (reason: string) => {
      if (!latest.current.canEdit) return;
      clearTimeout(idleTimers.current.get(reason));
      const idleTimer = window.setTimeout(() => cool(reason), warmIdleMs);
      idleTimers.current.set(reason, idleTimer);
      setReasons((current) => (current.has(reason) ? current : new Set(current).add(reason)));
      touchWarmSlot(slotKey);
    },
    [cool, latest, slotKey],
  );

  const flushCursor = useCallback(() => {
    const cursor = pendingCursor.current;
    const api = apiRef.current;
    if (!cursor || !api) return;
    pendingCursor.current = null;
    if (cursor === 'end') api.focusSummaryEnd();
    else api.placeCursorAtPoint(cursor.x, cursor.y);
  }, []);

  // A toggle is an edit: it commits as blur does, and the static shows it until the cache has it.
  const flushToggles = useCallback(() => {
    const api = apiRef.current;
    if (!api || pendingToggles.current.length === 0) return;
    const toggled = pendingToggles.current.splice(0).filter((checkboxId) => api.toggleChecklist(checkboxId));
    if (toggled.length > 0) {
      api.commit();
      const content = api.getContent();
      const base = latest.current.description;
      if (content !== base) setHandoff({ content, base });
    }
    cool(toggleReason);
  }, [cool, latest]);

  // An editor warm before editing started is ready already: the cursor goes once it is in the layout.
  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(flushCursor);
    return () => cancelAnimationFrame(frame);
  }, [editing, flushCursor]);

  // A frame after ready: the editor's first effect pass is over, so a remount of its view in dev StrictMode no longer drops
  // the focus and selection the cursor flush places.
  const readyFrame = useRef(0);
  const onEditorReady = useCallback(() => {
    cancelAnimationFrame(readyFrame.current);
    readyFrame.current = requestAnimationFrame(() => {
      flushToggles();
      flushCursor();
    });
  }, [flushToggles, flushCursor]);
  useEffect(() => () => cancelAnimationFrame(readyFrame.current), []);

  const onStaticReady = useCallback(() => setHolding(false), []);

  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { editing, canEdit, cursorAtPoint } = latest.current;
      if (editing || !canEdit) return;

      const checkboxWrapper = (event.target as Element).closest('.checklist-checkbox-wrapper');
      const checkboxId = checkboxWrapper?.querySelector<HTMLInputElement>('input.checklist-checkbox')?.dataset.checkboxId;
      if (checkboxId) {
        // The editor toggles it, so the static's input stays as rendered and the click starts no editing.
        event.preventDefault();
        event.stopPropagation();
        pendingToggles.current.push(checkboxId);
        if (apiRef.current) flushToggles();
        else warm(toggleReason);
        return;
      }

      if (!cursorAtPoint) return;
      // The app's own click handler may start editing; a point no editing took within this task expires.
      const point: Point = { x: event.clientX, y: event.clientY };
      clickPoint.current = point;
      window.setTimeout(() => {
        if (clickPoint.current === point) clickPoint.current = null;
      });
    },
    [flushToggles, latest, warm],
  );

  const hasReasons = reasons.size > 0;
  const isWarm = canEdit && hasReasons;

  // Without edit rights nothing stays warm, a queued toggle included.
  useEffect(() => {
    if (!canEdit && hasReasons) coolReasons(() => true);
  }, [canEdit, hasReasons, coolReasons]);

  // A hidden tab keeps no editor warm for the app; a queued toggle still waits for its editor.
  useEffect(() => {
    if (!hasReasons) return;
    const onVisibilityChange = () => {
      if (document.hidden) coolReasons((reason) => reason !== toggleReason);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [hasReasons, coolReasons]);

  // The cap counts warm editors only: never one editing, held, or waiting to apply a queued toggle.
  const capped = isWarm && !editing && !holding && !reasons.has(toggleReason);
  useEffect(() => {
    if (!capped) return;
    return registerWarmSlot(slotKey, () => coolReasons((reason) => reason !== toggleReason));
  }, [capped, slotKey, coolReasons]);

  useEffect(() => {
    const timers = idleTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return {
    apiRef,
    onEditorReady,
    onStaticReady,
    staticOverride,
    warm,
    cool,
    onClickCapture,
    editorMounted: isWarm || editing || holding,
    editorInFlow: editing || holding,
    staticMounted: !editing,
    holding,
  };
}
