import { createContext, type ReactNode, type Ref, useContext, useEffect, useRef } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { cn } from '~/utils/cn';

// Rules & visual examples → resizable-panels.md

// ─── Types ───────────────────────────────────────────────────────────────────

interface PanelConfig {
  id: string;
  minWidth: number;
  collapsedWidth: number;
  collapsible: boolean;
  grow: boolean;
}

interface PanelEntry extends PanelConfig {
  element: HTMLDivElement;
}

interface HintState {
  panelId: string;
  side: 'left' | 'right';
  mode: 'collapse' | 'expand';
  progress: number;
}

interface LayoutResult {
  widths: Record<string, number>;
  hints: HintState[];
  /** G12: true when the expand gate (G3) has been passed this frame */
  expandSnapped?: boolean;
}

interface DragState {
  separatorIndex: number;
  startX: number;
  autoFill: boolean;
  initialWidths: Record<string, number>;
  collapsedAtStart: Set<string>;
  /** G11: per-panel cascade when last victim is off-screen (keyed by drag direction) */
  perPanelCascade: { left: boolean; right: boolean };
}

interface PanelGroupContextValue {
  groupId: string;
  registerPanel: (entry: PanelEntry) => void;
  unregisterPanel: (id: string) => void;
  registerSeparator: (index: number, element: HTMLDivElement) => void;
  unregisterSeparator: (index: number) => void;
}

const PanelGroupContext = createContext<PanelGroupContextValue | null>(null);

// ─── Cursor override via adoptedStyleSheets ──────────────────────────────────

let cursorStyleSheet: CSSStyleSheet | null = null;

function setCursorOverride(cursor: string) {
  if (!cursorStyleSheet) {
    cursorStyleSheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, cursorStyleSheet];
  }
  cursorStyleSheet.replaceSync(`* { cursor: ${cursor} !important; }`);
}

function clearCursorOverride() {
  if (cursorStyleSheet) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== cursorStyleSheet);
    cursorStyleSheet = null;
  }
}

// ─── Pure layout helpers ─────────────────────────────────────────────────────

function snapWidth(panel: PanelConfig, width: number): number {
  if (!panel.collapsible) return Math.max(panel.minWidth, Math.min(panel.minWidth * 2, width));
  const halfwayPoint = (panel.collapsedWidth + panel.minWidth) / 2.2;
  if (width < halfwayPoint) return panel.collapsedWidth;
  if (width < panel.minWidth) return panel.minWidth;
  return Math.min(panel.minWidth * 2, width);
}

function collapseProgress(panel: PanelConfig, rawWidth: number): number {
  if (!panel.collapsible) return 0;
  const halfwayPoint = (panel.collapsedWidth + panel.minWidth) / 2.2;
  if (rawWidth >= panel.minWidth || rawWidth <= halfwayPoint) return 0;
  return (panel.minWidth - rawWidth) / (panel.minWidth - halfwayPoint);
}

// ─── Pure resolveLayout ──────────────────────────────────────────────────────
// Idempotent: same inputs always produce same outputs. No DOM, no side effects.
// Dragging backward re-evaluates from initialWidths and automatically reverses.

function resolveLayout(
  panels: PanelConfig[],
  separatorIndex: number,
  initialWidths: Record<string, number>,
  collapsedAtStart: Set<string>,
  dx: number,
  autoFill: boolean,
  perPanelCascade = false,
): LayoutResult {
  const widths = { ...initialWidths };
  const hints: HintState[] = [];

  if (dx === 0) return { widths, hints };

  const draggingLeft = dx < 0;
  const absDx = Math.abs(dx);

  // Grow side: opposite side of separator from shrink direction
  const growIndex = draggingLeft ? separatorIndex + 1 : separatorIndex;
  const growPanel = panels[growIndex];

  // ─── Expand gate (G3) ─────────────────────────────────────────────────
  if (growPanel && collapsedAtStart.has(growPanel.id) && growPanel.collapsible) {
    const expandThreshold = growPanel.minWidth - growPanel.collapsedWidth;
    if (absDx < expandThreshold) {
      // Gate active: all panels stay at initialWidths, show expand hint
      hints.push({
        panelId: growPanel.id,
        side: draggingLeft ? 'left' : 'right',
        mode: 'expand',
        progress: absDx / expandThreshold,
      });
      return { widths: { ...initialWidths }, hints };
    }
  }

  const isExpandingFromCollapsed = !!(growPanel && collapsedAtStart.has(growPanel.id) && growPanel.collapsible);

  // ─── Build victim list (G1, G9) ───────────────────────────────────────
  const victimIndices: number[] = [];
  if (draggingLeft) {
    for (let i = separatorIndex; i >= 0; i--) victimIndices.push(i);
  } else {
    for (let i = separatorIndex + 1; i < panels.length; i++) victimIndices.push(i);
  }

  // ─── Cascade: Phase 1 (shrink) then Phase 2 (collapse) ───────────────
  let remaining = absDx;
  const expandCost = isExpandingFromCollapsed && growPanel ? growPanel.minWidth - growPanel.collapsedWidth : 0;
  // In overflow mode the expand consumes trailing gap (O1), so victims
  // only shrink for px beyond the gate. In autoFill the expand must be
  // zero-sum: victims fund the full expand cost.
  if (expandCost > 0 && !autoFill) {
    remaining -= expandCost;
  }

  let totalFreed = 0;
  let collapseFreed = 0;

  // The direct victim is the first non-skipped panel in the victim list
  const directVictimIndex = victimIndices[0];

  // Grower initial width (used in growing-side section)
  const growInitial = growPanel ? (initialWidths[growPanel.id] ?? growPanel.minWidth) : 0;

  if (perPanelCascade) {
    // ─── G11: two-pass per-panel cascade ───────────────────────────────
    // Phase 1: shrink all victims to minWidth, nearest first (same as G9).
    for (const vi of victimIndices) {
      const victim = panels[vi];
      if (!victim || remaining <= 0) break;
      if (collapsedAtStart.has(victim.id)) continue;

      const initialW = initialWidths[victim.id] ?? victim.minWidth;
      const shrinkRoom = initialW - victim.minWidth;
      if (shrinkRoom <= 0) continue;

      const consumed = Math.min(shrinkRoom, remaining);
      widths[victim.id] = initialW - consumed;
      remaining -= consumed;
      totalFreed += consumed;
    }

    // Phase 2: per-panel collapse, nearest first.
    if (remaining > 0) {
      for (const vi of victimIndices) {
        const victim = panels[vi];
        if (!victim || remaining <= 0) break;
        if (collapsedAtStart.has(victim.id)) continue;
        if (!victim.collapsible) continue;

        // G10: in autoFill, block direct-victim collapse while expand
        // isn't fully funded by shrinking (prevents visual swap).
        if (autoFill && isExpandingFromCollapsed && vi === directVictimIndex && totalFreed < expandCost) continue;

        const rawWidth = victim.minWidth - remaining;
        const clampedWidth = snapWidth(victim, rawWidth);

        // Collapse hint (G4)
        const progress = collapseProgress(victim, rawWidth);
        if (progress > 0) {
          hints.push({
            panelId: victim.id,
            side: draggingLeft ? 'right' : 'left',
            mode: 'collapse',
            progress,
          });
        }

        if (clampedWidth <= victim.collapsedWidth) {
          const consumed = victim.minWidth - victim.collapsedWidth;
          widths[victim.id] = victim.collapsedWidth;
          remaining -= consumed;
          collapseFreed += consumed;
          continue;
        }

        if (clampedWidth >= victim.minWidth) {
          widths[victim.id] = victim.minWidth;
          break;
        }

        widths[victim.id] = clampedWidth;
        break;
      }
    }
  } else {
    // ─── G9: standard two-phase cascade ─────────────────────────────────

    // Phase 1: shrink all victims toward minWidth
    for (const vi of victimIndices) {
      const victim = panels[vi];
      if (!victim || remaining <= 0) break;
      if (collapsedAtStart.has(victim.id)) continue;

      const initialW = initialWidths[victim.id] ?? victim.minWidth;
      const shrinkRoom = initialW - victim.minWidth;
      if (shrinkRoom <= 0) continue;

      const consumed = Math.min(shrinkRoom, remaining);
      widths[victim.id] = initialW - consumed;
      remaining -= consumed;
      totalFreed += consumed;
    }

    // Phase 2: collapse victims (only after all are at min) (G9)
    if (remaining > 0) {
      for (const vi of victimIndices) {
        const victim = panels[vi];
        if (!victim || remaining <= 0) break;
        if (collapsedAtStart.has(victim.id)) continue;
        if (!victim.collapsible) continue;

        // G10: in autoFill, block direct-victim collapse while the
        // expand isn't fully funded by shrinking (prevents visual swap).
        // In overflow the expand is free (trailing gap), so G10 doesn't apply.
        if (autoFill && isExpandingFromCollapsed && vi === directVictimIndex && totalFreed < expandCost) {
          continue;
        }

        const rawWidth = victim.minWidth - remaining;
        const clampedWidth = snapWidth(victim, rawWidth);

        // Collapse hint (G4)
        const progress = collapseProgress(victim, rawWidth);
        if (progress > 0) {
          hints.push({
            panelId: victim.id,
            side: draggingLeft ? 'right' : 'left',
            mode: 'collapse',
            progress,
          });
        }

        if (clampedWidth <= victim.collapsedWidth) {
          // Fully collapsed
          const consumed = victim.minWidth - victim.collapsedWidth;
          widths[victim.id] = victim.collapsedWidth;
          remaining -= consumed;
          collapseFreed += consumed;
          continue;
        }

        if (clampedWidth >= victim.minWidth) {
          // Snapped back to minWidth — in collapse zone, layout freezes
          widths[victim.id] = victim.minWidth;
          break;
        }

        // Between snap point and collapsedWidth — shouldn't normally happen
        // but handle gracefully
        widths[victim.id] = clampedWidth;
        break;
      }
    }
  }

  // ─── Growing side (A2, O1, O2) ──────────────────────────────────────
  // No max-width cap — grower absorbs all freed pixels to keep total
  // panel sum constant. The viewport clamp in redistributePanels
  // prevents any panel from exceeding the visible area after drag ends.
  if (growPanel) {
    let growDelta = totalFreed;

    if (isExpandingFromCollapsed) {
      const totalAvailable = growDelta + collapseFreed;
      const extraGrowth = autoFill ? Math.max(0, totalAvailable - expandCost) : totalAvailable;
      widths[growPanel.id] = growPanel.minWidth + extraGrowth;
    } else if (!collapsedAtStart.has(growPanel.id)) {
      growDelta += collapseFreed;
      widths[growPanel.id] = growInitial + growDelta;
    }
  }

  return { widths, hints, expandSnapped: isExpandingFromCollapsed };
}

// ─── Resize hint ─────────────────────────────────────────────────────────────

const HINT_TRANSFORM = [
  'translateY(-50%)',
  'translateX(calc(-1 * var(--hint-flip, 1) * var(--hint-progress, 0) * 12px))',
  'scale(calc(0.5 + var(--hint-progress, 0) * 0.5))',
  'scaleX(var(--hint-flip, 1))',
].join(' ');

function ResizeHint() {
  return (
    <div
      data-resize-hint=""
      className="absolute top-1/2 z-999 pointer-events-none flex items-center justify-center"
      style={{
        left: 'var(--hint-left, auto)',
        right: 'var(--hint-right, auto)',
        opacity: 'var(--hint-progress, 0)',
        transform: HINT_TRANSFORM,
      }}
    >
      <div
        className="absolute w-18 h-24 rounded-full"
        style={{
          background:
            'radial-gradient(ellipse, var(--background) 30%, color-mix(in oklch, var(--background) 60%, transparent) 60%, transparent 80%)',
        }}
      />
      <svg
        className="relative text-muted-foreground"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </svg>
    </div>
  );
}

function showResizeHint(
  element: HTMLDivElement,
  side: 'left' | 'right',
  mode: 'collapse' | 'expand',
  progress: number,
) {
  const attr = `${mode}-${side}`;
  const s = element.style;
  if (element.getAttribute('data-resizing') !== attr) {
    element.setAttribute('data-resizing', attr);
    const shouldFlip = (mode === 'collapse') === (side === 'left');
    s.setProperty('--hint-flip', shouldFlip ? '-1' : '1');
    s.setProperty('--hint-left', side === 'left' ? '8px' : 'auto');
    s.setProperty('--hint-right', side === 'right' ? '8px' : 'auto');
  }
  s.setProperty('--hint-progress', `${progress}`);
  s.setProperty('--content-opacity', `${1 - progress}`);
}

function clearResizeHint(element: HTMLDivElement) {
  element.removeAttribute('data-resizing');
  const s = element.style;
  s.removeProperty('--hint-progress');
  s.removeProperty('--hint-flip');
  s.removeProperty('--hint-left');
  s.removeProperty('--hint-right');
  s.removeProperty('--content-opacity');
}

// ─── ResizablePanelGroup ─────────────────────────────────────────────────────

export interface PanelGroupApi {
  /** Expand a collapsed panel by its id. No-op if already expanded. */
  expandPanel: (panelId: string) => void;
  /** Toggle a panel between collapsed and expanded by its id. */
  togglePanel: (panelId: string) => void;
}

interface PanelGroupProps {
  /** Unique identifier for the group */
  id: string;
  /** Initial panel widths as { panelId: pixels }. Applied on first mount only. */
  defaultLayout?: Record<string, number>;
  /** Fired after drag ends or keyboard resize, with the final { panelId: pixels } layout */
  onLayoutChanged?: (layout: Record<string, number>) => void;
  /** Called when a panel's collapsed state changes. Derived from width <= collapsedWidth. */
  onCollapseChange?: (panelId: string, collapsed: boolean) => void;
  /** Called after mount with imperative methods for external panel control. */
  onReady?: (api: PanelGroupApi) => void;
  /** When false, panels always fit the container (no horizontal scroll). Default: true (auto-detected). */
  overflow?: boolean;
  className?: string;
  children: ReactNode;
}

export function ResizablePanelGroup({
  id,
  defaultLayout,
  onLayoutChanged,
  onCollapseChange,
  onReady,
  overflow = true,
  className,
  children,
}: PanelGroupProps) {
  const panelsRef = useRef<PanelEntry[]>([]);
  const widthsRef = useRef<Record<string, number>>({});
  const dragRef = useRef<DragState | null>(null);
  const expandedWidthsRef = useRef<Record<string, number>>({});
  const separatorsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const prevContainerWidthRef = useRef(0);
  const onLayoutChangedRef = useLatestRef(onLayoutChanged);
  const onCollapseChangeRef = useLatestRef(onCollapseChange);
  const onReadyRef = useLatestRef(onReady);
  const defaultLayoutRef = useLatestRef(defaultLayout);

  // ─── Apply widths to DOM ────────────────────────────────────────────────
  const applyWidths = () => {
    for (const panel of panelsRef.current) {
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      panel.element.style.width = `${w}px`;
      panel.element.style.flexShrink = '0';
    }
  };

  // ─── Set width with collapse change detection ──────────────────────────
  const setWidth = (panel: PanelEntry, width: number) => {
    const prevWidth = widthsRef.current[panel.id] ?? panel.minWidth;
    widthsRef.current[panel.id] = width;

    if (onCollapseChangeRef.current && panel.collapsible) {
      const wasCollapsed = prevWidth <= panel.collapsedWidth;
      const isCollapsed = width <= panel.collapsedWidth;
      if (wasCollapsed !== isCollapsed) onCollapseChangeRef.current(panel.id, isCollapsed);
    }

    if (width > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = width;
  };

  // ─── Apply a full LayoutResult to refs + DOM ───────────────────────────
  const applyLayoutResult = (result: LayoutResult) => {
    // Apply widths
    for (const panel of panelsRef.current) {
      const newW = result.widths[panel.id];
      if (newW !== undefined) setWidth(panel, newW);
    }

    // Apply hints: clear all, then show active ones
    const hintedPanelIds = new Set(result.hints.map((h) => h.panelId));
    for (const panel of panelsRef.current) {
      if (!hintedPanelIds.has(panel.id)) clearResizeHint(panel.element);
    }
    for (const hint of result.hints) {
      const panel = panelsRef.current.find((p) => p.id === hint.panelId);
      if (panel) showResizeHint(panel.element, hint.side, hint.mode, hint.progress);
    }

    applyWidths();
  };

  const getWidths = (): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const panel of panelsRef.current) {
      result[panel.id] = widthsRef.current[panel.id] ?? panel.minWidth;
    }
    return result;
  };

  // ─── Mode detection (G6) ───────────────────────────────────────────────
  // Uses parent's width — the container itself may have min-width set by
  // updateContainerWidth(), which would inflate its own getBoundingClientRect().
  const computeAutoFill = () => {
    if (!overflow) return true;
    const container = containerRef.current;
    if (!container) return true;
    const parentWidth = container.parentElement
      ? container.parentElement.getBoundingClientRect().width
      : container.getBoundingClientRect().width;
    return getIdealPanelSum() + getSeparatorSpace() <= parentWidth;
  };

  // ─── Keyboard step (G5) ────────────────────────────────────────────────
  const applyKeyboardStep = (separatorIndex: number, delta: number) => {
    // Compute mode BEFORE mutating widths so getBoundingClientRect is fresh
    const autoFill = computeAutoFill();

    const panels = panelsRef.current;
    const draggingLeft = delta < 0;
    const victimIndex = draggingLeft ? separatorIndex : separatorIndex + 1;
    const growIndex = draggingLeft ? separatorIndex + 1 : separatorIndex;
    const victim = panels[victimIndex];
    const grower = panels[growIndex];
    if (!victim || !grower) return;

    const victimCurrent = widthsRef.current[victim.id] ?? victim.minWidth;
    const growerCurrent = widthsRef.current[grower.id] ?? grower.minWidth;
    const step = Math.abs(delta);

    // --- Victim side ---
    let victimShrunk = 0;
    const victimIsCollapsed = victim.collapsible && victimCurrent <= victim.collapsedWidth;

    if (!victimIsCollapsed) {
      // Clamp without snap: keyboard steps don't trigger snap-collapse (use Enter for that)
      const floor = victim.collapsible ? victim.collapsedWidth : victim.minWidth;
      const newVictimW = Math.max(floor, victimCurrent - step);
      victimShrunk = victimCurrent - newVictimW;
      if (victimShrunk > 0) setWidth(victim, newVictimW);
    }

    // --- Grower side: only grow by what victim actually freed (zero-sum) ---
    if (victimShrunk > 0) {
      if (growerCurrent <= grower.collapsedWidth && grower.collapsible) {
        // Expand-on-reverse: collapsed grower snaps to minWidth
        setWidth(grower, grower.minWidth);
      } else {
        const maxGrow = autoFill ? Number.MAX_SAFE_INTEGER : grower.minWidth * 2;
        setWidth(grower, Math.max(grower.minWidth, Math.min(maxGrow, growerCurrent + victimShrunk)));
      }
    }

    applyWidths();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
  };

  // ─── Panel collapse/expand by id ─────────────────────────────────────
  const expandPanel = (panelId: string) => {
    const panel = panelsRef.current.find((p) => p.id === panelId);
    if (!panel?.collapsible) return;

    const currentWidth = widthsRef.current[panelId] ?? panel.minWidth;
    if (currentWidth > panel.collapsedWidth) return; // already expanded

    const targetWidth = expandedWidthsRef.current[panelId] ?? panel.minWidth;
    setWidth(panel, targetWidth);
    applyWidths();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
  };

  const togglePanel = (panelId: string) => {
    const panel = panelsRef.current.find((p) => p.id === panelId);
    if (!panel?.collapsible) return;

    const currentWidth = widthsRef.current[panelId] ?? panel.minWidth;
    const isCollapsed = currentWidth <= panel.collapsedWidth;
    setWidth(panel, isCollapsed ? (expandedWidthsRef.current[panelId] ?? panel.minWidth) : panel.collapsedWidth);

    applyWidths();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
  };

  const toggleCollapseAtSeparator = (separatorIndex: number) => {
    const leftPanel = panelsRef.current[separatorIndex];
    if (leftPanel) togglePanel(leftPanel.id);
  };

  // ─── Drag lifecycle ────────────────────────────────────────────────────
  const startDrag = (separatorIndex: number, startX: number) => {
    const collapsedAtStart = new Set<string>();
    const snapshot: Record<string, number> = {};

    for (const panel of panelsRef.current) {
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      snapshot[panel.id] = w;
      if (panel.collapsible && w <= panel.collapsedWidth) collapsedAtStart.add(panel.id);
    }

    // G11: check if last victim in each direction is off-screen
    const perPanelCascade = { left: false, right: false };
    const isAutoFill = computeAutoFill();
    if (!isAutoFill) {
      const scrollParent = containerRef.current?.parentElement;
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect();

        // Dragging left → victims are indices [separatorIndex..0]
        // Last victim (farthest from separator) is index 0
        const leftLastVictim = panelsRef.current[0];
        if (leftLastVictim && !collapsedAtStart.has(leftLastVictim.id)) {
          const r = leftLastVictim.element.getBoundingClientRect();
          if (r.left < parentRect.left) perPanelCascade.left = true;
        }

        // Dragging right → victims are indices [separatorIndex+1..end]
        // Last victim (farthest from separator) is the last panel
        const rightLastVictim = panelsRef.current[panelsRef.current.length - 1];
        if (rightLastVictim && !collapsedAtStart.has(rightLastVictim.id)) {
          const r = rightLastVictim.element.getBoundingClientRect();
          if (r.right > parentRect.right) perPanelCascade.right = true;
        }
      }
    }

    dragRef.current = {
      separatorIndex,
      startX,
      autoFill: isAutoFill,
      initialWidths: snapshot,
      collapsedAtStart,
      perPanelCascade,
    };

    setCursorOverride('col-resize');
  };

  const cleanupDrag = () => {
    dragRef.current = null;
    prevContainerWidthRef.current = 0; // Force observer to redistribute after drag
    clearCursorOverride();
    for (const panel of panelsRef.current) clearResizeHint(panel.element);
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    cleanupDrag();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
  };

  const abortDrag = () => {
    if (!dragRef.current) return;
    const { initialWidths } = dragRef.current;
    for (const panel of panelsRef.current) {
      if (initialWidths[panel.id] !== undefined) setWidth(panel, initialWidths[panel.id]);
    }
    cleanupDrag();
    applyWidths();
    updateContainerWidth();
  };

  // ─── Panel registration ────────────────────────────────────────────────
  const sortPanels = () => {
    panelsRef.current.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      // biome-ignore lint/style/noNonNullAssertion: bitwise comparison
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
  };

  const initializePanel = (entry: PanelEntry) => {
    const dl = defaultLayoutRef.current;
    const width = dl?.[entry.id] ?? expandedWidthsRef.current[entry.id] ?? entry.minWidth;
    widthsRef.current[entry.id] = width;

    if (onCollapseChangeRef.current && entry.collapsible) {
      const isCollapsed = width <= entry.collapsedWidth;
      onCollapseChangeRef.current(entry.id, isCollapsed);
    }
    if (width > entry.collapsedWidth) expandedWidthsRef.current[entry.id] = width;
  };

  const registerPanel = (entry: PanelEntry) => {
    const existing = panelsRef.current.findIndex((p) => p.id === entry.id);
    if (existing >= 0) panelsRef.current[existing] = entry;
    else panelsRef.current.push(entry);

    sortPanels();
    initializePanel(entry);
    applyWidths();
    if (dragRef.current) abortDrag();
    updateContainerWidth();
  };

  const unregisterPanel = (panelId: string) => {
    panelsRef.current = panelsRef.current.filter((p) => p.id !== panelId);
    delete widthsRef.current[panelId];
    if (dragRef.current) abortDrag();
    updateContainerWidth();
  };

  const registerSeparator = (index: number, element: HTMLDivElement) => {
    separatorsRef.current.set(index, element);
  };

  const unregisterSeparator = (index: number) => {
    separatorsRef.current.delete(index);
  };

  // ─── Measure separator space from DOM ────────────────────────────────
  const getSeparatorSpace = () => {
    let sepSpace = 0;
    for (const sep of separatorsRef.current.values()) {
      const style = getComputedStyle(sep);
      sepSpace +=
        sep.getBoundingClientRect().width + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight);
    }
    return sepSpace;
  };

  // ─── Panel sum helpers ───────────────────────────────────────────────
  const getPanelSum = () => {
    let sum = 0;
    for (const p of panelsRef.current) sum += widthsRef.current[p.id] ?? p.minWidth;
    return sum;
  };

  const getIdealPanelSum = () => {
    let sum = 0;
    for (const p of panelsRef.current) {
      const w = widthsRef.current[p.id] ?? p.minWidth;
      sum += p.collapsible && w <= p.collapsedWidth ? p.collapsedWidth : p.minWidth * 1.25;
    }
    return sum;
  };

  // ─── Update container min-width for overflow headroom ──────────────────
  const updateContainerWidth = () => {
    const container = containerRef.current;
    if (!container) return;

    if (computeAutoFill()) {
      container.style.minWidth = '';
      return;
    }

    const sepSpace = getSeparatorSpace();
    // max(ideal, actual) prevents force-shrinking panels already grown beyond 1.5×.
    const targetWidth = Math.max(getIdealPanelSum(), getPanelSum()) + sepSpace;
    container.style.minWidth = `${Math.ceil(targetWidth)}px`;
  };

  // ─── Proportional redistribution ─────────────────────────────────────
  // Scale non-collapsed panels so their total matches the available container space.
  const redistributePanels = () => {
    const container = containerRef.current;
    if (!container) return false;

    const sepSpace = getSeparatorSpace();
    const available = container.getBoundingClientRect().width - sepSpace;
    if (available <= 0) return false;

    // Viewport clamp: no single panel should exceed the scroll parent's visible width
    const scrollParent = container.parentElement;
    const viewportWidth = scrollParent ? scrollParent.getBoundingClientRect().width - sepSpace : available;

    // Pre-pass: clamp any panel exceeding the viewport width
    let changed = false;
    for (const panel of panelsRef.current) {
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      if (w > viewportWidth && viewportWidth >= panel.minWidth) {
        widthsRef.current[panel.id] = viewportWidth;
        if (viewportWidth > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = viewportWidth;
        changed = true;
      }
    }

    const panelSum = getPanelSum();
    if (panelSum <= 0) return false;

    const ratio = available / panelSum;
    if (Math.abs(ratio - 1) < 0.005) {
      // Even if ratio is ~1, the pre-pass clamp may have changed widths
      if (changed) {
        applyWidths();
        updateContainerWidth();
      }
      return changed;
    }

    let allocated = 0;
    const resizable: PanelEntry[] = [];
    for (const panel of panelsRef.current) {
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      const isCollapsed = panel.collapsible && w <= panel.collapsedWidth;
      if (isCollapsed || !panel.grow) {
        allocated += w;
      } else {
        resizable.push(panel);
      }
    }

    const target = available - allocated;
    let distributed = 0;
    for (let i = 0; i < resizable.length; i++) {
      const panel = resizable[i];
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      const isLast = i === resizable.length - 1;
      // Last panel absorbs rounding remainder to keep total exact
      let newW = isLast
        ? Math.max(panel.minWidth, target - distributed)
        : Math.max(panel.minWidth, Math.floor(w * ratio));
      // Clamp to viewport width so no panel exceeds the visible area
      newW = Math.min(newW, viewportWidth);
      distributed += newW;
      if (Math.abs(newW - w) >= 1) {
        widthsRef.current[panel.id] = newW;
        if (newW > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = newW;
        changed = true;
      }
    }

    if (changed) {
      applyWidths();
      updateContainerWidth();
    }
    return changed;
  };

  // ─── ResizeObserver: redistribute on container or parent resize ─────────
  // Observes both the container (for autoFill mode resizes) and the parent
  // scroll container (for overflow mode where the container has a fixed
  // min-width and doesn't resize when the window shrinks).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      if (dragRef.current) return;

      // Update container min-width for mode transitions (e.g. parent
      // resize crossing the autoFill/overflow threshold).
      updateContainerWidth();

      if (redistributePanels()) {
        onLayoutChangedRef.current?.(getWidths());
      }
    };

    const observer = new ResizeObserver(() => handleResize());
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    return () => observer.disconnect();
  }, []);

  // ─── Expose imperative API ──────────────────────────────────────────────
  useEffect(() => {
    onReadyRef.current?.({ expandPanel, togglePanel });
  }, []);

  // ─── Pointer event handlers ────────────────────────────────────────────
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const ppc = dx < 0 ? drag.perPanelCascade.left : drag.perPanelCascade.right;
      const result = resolveLayout(
        panelsRef.current,
        drag.separatorIndex,
        drag.initialWidths,
        drag.collapsedAtStart,
        dx,
        drag.autoFill,
        ppc,
      );

      applyLayoutResult(result);
    };

    const handlePointerUp = () => {
      endDrag();
      for (const sep of separatorsRef.current.values()) {
        sep.setAttribute('data-separator', 'inactive');
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      clearCursorOverride();
    };
  }, []);

  const ctxValue: PanelGroupContextValue = {
    groupId: id,
    registerPanel,
    unregisterPanel,
    registerSeparator,
    unregisterSeparator,
  };

  const dragCtx: SeparatorDragContextValue = {
    startDrag,
    applyKeyboardStep,
    toggleCollapseAtSeparator,
    getPanels: () => panelsRef.current,
    getWidths: () => widthsRef.current,
  };

  return (
    <PanelGroupContext.Provider value={ctxValue}>
      <SeparatorDragContext.Provider value={dragCtx}>
        <div
          ref={containerRef}
          className={className}
          data-panel-group={id}
          style={{ display: 'flex', overflow: 'visible' }}
        >
          {children}
        </div>
      </SeparatorDragContext.Provider>
    </PanelGroupContext.Provider>
  );
}

// ─── ResizablePanel ──────────────────────────────────────────────────────────

interface PanelProps {
  /** Stable panel identifier */
  id: string;
  /** Minimum width in pixels */
  minWidth: number;
  /** Width when collapsed in pixels (default: 0). Must be < minWidth. */
  collapsedWidth?: number;
  /** Whether the panel can be collapsed by dragging past the halfway point */
  collapsible?: boolean;
  /** Whether the panel grows during proportional redistribution (default: true) */
  grow?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  [key: `data-${string}`]: string | undefined;
}

export function ResizablePanel({
  id,
  minWidth,
  collapsedWidth = 0,
  collapsible = false,
  grow = true,
  className,
  children,
  ref,
  ...rest
}: PanelProps) {
  const ctx = useContext(PanelGroupContext);
  const internalRef = useRef<HTMLDivElement | null>(null);

  const setRef = (el: HTMLDivElement | null) => {
    internalRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  useEffect(() => {
    const el = internalRef.current;
    if (!el || !ctx) return;
    const entry: PanelEntry = { id, element: el, minWidth, collapsedWidth, collapsible, grow };
    ctx.registerPanel(entry);
    return () => ctx.unregisterPanel(id);
  }, [id, minWidth, collapsedWidth, collapsible, grow, ctx]);

  return (
    <div
      ref={setRef}
      className={className}
      data-panel={id}
      style={{ overflow: 'hidden', position: 'relative', flexShrink: 0 }}
      {...rest}
    >
      <div className="h-full" style={{ opacity: 'var(--content-opacity, 1)' }}>
        {children}
      </div>
      <ResizeHint />
    </div>
  );
}

// ─── Separator drag context ──────────────────────────────────────────────────

interface SeparatorDragContextValue {
  startDrag: (separatorIndex: number, startX: number) => void;
  applyKeyboardStep: (separatorIndex: number, delta: number) => void;
  toggleCollapseAtSeparator: (separatorIndex: number) => void;
  getPanels: () => PanelEntry[];
  getWidths: () => Record<string, number>;
}

const SeparatorDragContext = createContext<SeparatorDragContextValue | null>(null);

// ─── ResizableSeparator ──────────────────────────────────────────────────────

const KEYBOARD_STEP = 20;

interface SeparatorProps {
  /** The index of this separator among siblings (0-based). Required for drag targeting. */
  index: number;
  className?: string;
  children?: ReactNode;
  [key: `data-${string}`]: string | undefined;
}

export function ResizableSeparator({ index, className, children, ...rest }: SeparatorProps) {
  const ctx = useContext(PanelGroupContext);
  const dragCtx = useContext(SeparatorDragContext);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ctx) return;
    ctx.registerSeparator(index, el);
    return () => ctx.unregisterSeparator(index);
  }, [index, ctx]);

  const lastPointerDownRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragCtx || !ref.current) return;
    e.preventDefault();

    const now = Date.now();
    if (now - lastPointerDownRef.current < 300) {
      // Double-click detected — toggle collapse instead of starting drag
      lastPointerDownRef.current = 0;
      dragCtx.toggleCollapseAtSeparator(index);
      return;
    }
    lastPointerDownRef.current = now;

    ref.current.setPointerCapture(e.pointerId);
    ref.current.setAttribute('data-separator', 'drag');
    ref.current.focus();
    dragCtx.startDrag(index, e.clientX);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!dragCtx) return;
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        dragCtx.applyKeyboardStep(index, -KEYBOARD_STEP);
        break;
      case 'ArrowRight':
        e.preventDefault();
        dragCtx.applyKeyboardStep(index, KEYBOARD_STEP);
        break;
      case 'Home':
        e.preventDefault();
        dragCtx.applyKeyboardStep(index, -10000);
        break;
      case 'End':
        e.preventDefault();
        dragCtx.applyKeyboardStep(index, 10000);
        break;
      case 'Enter':
        e.preventDefault();
        dragCtx.toggleCollapseAtSeparator(index);
        break;
    }
  };

  const handlePointerEnter = () => {
    ref.current?.setAttribute('data-separator', 'hover');
  };

  const handlePointerLeave = () => {
    if (ref.current?.getAttribute('data-separator') !== 'drag') {
      ref.current?.setAttribute('data-separator', 'inactive');
    }
  };

  const panels = dragCtx?.getPanels() ?? [];
  const widths = dragCtx?.getWidths() ?? {};
  const leftPanel = panels[index];
  const rightPanel = panels[index + 1];
  const leftId = leftPanel?.id;
  const rightId = rightPanel?.id;
  const ariaControls = [leftId, rightId].filter(Boolean).join(' ');
  const currentLeftWidth = leftId ? (widths[leftId] ?? 0) : 0;
  const minVal = leftPanel?.collapsible ? leftPanel.collapsedWidth : (leftPanel?.minWidth ?? 0);
  const maxVal = leftPanel ? leftPanel.minWidth * 2 : 0;

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="horizontal"
      aria-valuemin={minVal}
      aria-valuemax={maxVal === Number.POSITIVE_INFINITY ? undefined : maxVal}
      aria-valuenow={Math.round(currentLeftWidth)}
      aria-controls={ariaControls || undefined}
      tabIndex={0}
      data-separator="inactive"
      className={cn('select-none focus-visible:outline-none focus-visible:ring-0', className)}
      style={{ touchAction: 'none', cursor: 'col-resize', flexShrink: 0 }}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}
