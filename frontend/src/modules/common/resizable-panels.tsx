import { createContext, type ReactNode, type Ref, useContext, useEffect, useRef } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { cn } from '~/utils/cn';

// ─── Drag & snap behaviour rules ────────────────────────────────────────────
//
// STATE MANAGEMENT: idempotent pure-function design. resolveLayout() takes
// (panelConfigs, separatorIndex, initialWidths, dx, mode) and returns the
// complete layout — widths + hint data. Dragging backward with the same
// swipe reverses the entire layout change automatically, no special undo logic.
//
// LAYOUT: Panels use pixel widths (style.width) inside a flex container.
// No CSS grid, no fr tracks. Stored widths always equal rendered widths.
//
// G1. DIRECTION DETERMINES ROLES
//     The panel on the shrinking side of the separator is the victim.
//     The panel on the growing side is the grower.
//
// G2. COLLAPSE SNAP
//     Snap point at (collapsedWidth + minWidth) / 2.2. When a panel
//     is dragged beyond the snap point it snaps to collapsedWidth.
//     Moving back before snap point snaps it back to minWidth. Once
//     collapsed, the panel stays collapsed for the rest of the drag:
//     further drag delta cascades to the next victim (G9).
//     While a victim traverses the collapse zone (minWidth → snap
//     point), the layout freezes and only the collapse hint progresses.
//
// G3. EXPAND GATE
//     When a collapsed panel is the grower, the user must drag the
//     full (minWidth - collapsedWidth) distance before the panel snaps
//     to minWidth. Until the threshold is reached, the handle stays
//     frozen and an expand hint shows progress (0→1). Reversing back
//     below the threshold re-enters the gate.
//
// G4. RESIZE HINTS
//     A visual hint (arrow + radial glow) appears during collapse or
//     expand zones. Mode 'collapse' → inward arrow. Mode 'expand' →
//     outward arrow. Progress 0→1.
//
// G5. KEYBOARD
//     Arrow keys: single-step, no cascade. Direct victim shrinks,
//     grower grows. Expand-on-reverse: if grower is collapsed and the
//     key direction pulls it open, expand to minWidth. Enter: toggle
//     collapse on the left panel of the separator.
//
// G6. MODE DETECTION
//     Collapsed panels contribute collapsedWidth, non-collapsed panels
//     contribute minWidth * 1.5. If ideal sum + separator space <=
//     parentWidth → autoFill, else → overflow. Computed at drag
//     start and fixed for the entire drag. In overflow mode the
//     container min-width is set to the ideal sum so panels have
//     room to grow without collapsing others.
//
// G8. ZERO-SUM RESIZE
//     Every pixel freed by victims goes to the grower. In autoFill
//     mode the grower has no upper cap. In overflow mode the grower
//     stops at maxWidth (minWidth × 2) for normal resize, but
//     collapse-freed pixels extend the cap so the grower absorbs
//     the space instead of leaving a trailing gap.
//
// G9. TWO-PHASE CASCADE
//     Phase 1 — shrink toward minWidth in victim order away from
//     separator. Phase 2 — collapse (only after all victims at min).
//     Panels collapsed at drag start are skipped in both phases.
//
// G10. NO SWAP: EXPAND BLOCKS DIRECT VICTIM COLLAPSE
//     When a panel is expanding via the expand snap, the direct
//     victim cannot enter Phase 2.
//
// AUTOFILL MODE — panels fit the container. maxWidth not enforced.
//     Collapse freed pixels go to grower (A2).
//
// OVERFLOW MODE — panels exceed container, horizontal scroll.
//     Collapse freed pixels go to grower (maxWidth extended by
//     collapseFreed so grower can absorb the space).
//     Expand uses trailing gap first (O2).
//
// ─────────────────────────────────────────────────────────────────────────────

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
}

interface DragState {
  separatorIndex: number;
  startX: number;
  autoFill: boolean;
  initialWidths: Record<string, number>;
  collapsedAtStart: Set<string>;
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

      // G10: when expanding, block collapse of the direct victim
      if (isExpandingFromCollapsed && vi === directVictimIndex) {
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

  // ─── Growing side (G8, A2, O1, O2) ───────────────────────────────────
  if (growPanel) {
    const growInitial = initialWidths[growPanel.id] ?? growPanel.minWidth;
    let growDelta = totalFreed;

    // If expanding from collapsed, snap to minWidth + extra freed beyond expand cost
    if (isExpandingFromCollapsed) {
      const maxGrow = autoFill ? Number.MAX_SAFE_INTEGER : growPanel.minWidth * 2;
      // In autoFill victims funded the expand, so only the surplus goes to extra growth
      const extraGrowth = autoFill ? Math.max(0, growDelta - expandCost) : growDelta;
      widths[growPanel.id] = Math.min(maxGrow, growPanel.minWidth + extraGrowth);
    } else if (!collapsedAtStart.has(growPanel.id)) {
      // Collapse freed pixels always go to grower — in autoFill to
      // maintain zero-sum, in overflow to avoid a trailing gap while
      // the container can't update mid-drag.
      growDelta += collapseFreed;

      // In overflow mode the normal cap is 2× minWidth, but we extend
      // it by collapseFreed so the grower can absorb the freed space.
      const normalMax = autoFill ? Number.MAX_SAFE_INTEGER : growPanel.minWidth * 2;
      const maxGrow = autoFill ? normalMax : normalMax + collapseFreed;
      widths[growPanel.id] = Math.min(maxGrow, growInitial + growDelta);
    }
  }

  return { widths, hints };
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
}

function clearResizeHint(element: HTMLDivElement) {
  element.removeAttribute('data-resizing');
  const s = element.style;
  s.removeProperty('--hint-progress');
  s.removeProperty('--hint-flip');
  s.removeProperty('--hint-left');
  s.removeProperty('--hint-right');
}

// ─── ResizablePanelGroup ─────────────────────────────────────────────────────

export interface PanelGroupProps {
  /** Unique identifier for the group */
  id: string;
  /** Initial panel widths as { panelId: pixels }. Applied on first mount only. */
  defaultLayout?: Record<string, number>;
  /** Fired after drag ends or keyboard resize, with the final { panelId: pixels } layout */
  onLayoutChanged?: (layout: Record<string, number>) => void;
  /** Called when a panel's collapsed state changes. Derived from width <= collapsedWidth. */
  onCollapseChange?: (panelId: string, collapsed: boolean) => void;
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

  // ─── Toggle collapse (G5: Enter key) ──────────────────────────────────
  const toggleCollapse = (separatorIndex: number) => {
    const leftPanel = panelsRef.current[separatorIndex];
    if (!leftPanel?.collapsible) return;

    const currentWidth = widthsRef.current[leftPanel.id] ?? leftPanel.minWidth;
    const isCollapsed = currentWidth <= leftPanel.collapsedWidth;
    setWidth(leftPanel, isCollapsed ? leftPanel.minWidth : leftPanel.collapsedWidth);

    applyWidths();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
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

    dragRef.current = {
      separatorIndex,
      startX,
      autoFill: computeAutoFill(),
      initialWidths: snapshot,
      collapsedAtStart,
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

    if (onCollapseChangeRef.current && entry.collapsible && width <= entry.collapsedWidth) {
      onCollapseChangeRef.current(entry.id, true);
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
      sum += p.collapsible && w <= p.collapsedWidth ? p.collapsedWidth : p.minWidth * 1.5;
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

    const panelSum = getPanelSum();
    if (panelSum <= 0) return false;

    const ratio = available / panelSum;
    if (Math.abs(ratio - 1) < 0.005) return false;

    let changed = false;
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
      const newW = isLast
        ? Math.max(panel.minWidth, target - distributed)
        : Math.max(panel.minWidth, Math.round(w * ratio));
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

  // ─── ResizeObserver: redistribute on container resize ──────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      if (dragRef.current) return;
      const entry = entries[0];
      if (!entry) return;

      // Update container min-width for mode transitions (e.g. parent
      // resize crossing the autoFill/overflow threshold).
      updateContainerWidth();

      // Use content-box width — flex items are laid out in the content box,
      // so border/padding must not inflate the available space.
      const contentBox = entry.contentBoxSize?.[0];
      const newWidth = contentBox ? contentBox.inlineSize : entry.contentRect.width;
      if (prevContainerWidthRef.current > 0 && Math.abs(newWidth - prevContainerWidthRef.current) < 1) return;

      prevContainerWidthRef.current = newWidth;

      if (redistributePanels()) {
        onLayoutChangedRef.current?.(getWidths());
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ─── Pointer event handlers ────────────────────────────────────────────
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const result = resolveLayout(
        panelsRef.current,
        drag.separatorIndex,
        drag.initialWidths,
        drag.collapsedAtStart,
        dx,
        drag.autoFill,
      );
      applyLayoutResult(result);
      // In overflow, tighten container to actual content so no trailing gap mid-drag
      if (!drag.autoFill && containerRef.current) {
        containerRef.current.style.minWidth = `${Math.ceil(getPanelSum() + getSeparatorSpace())}px`;
      }
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
    toggleCollapse,
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

export interface PanelProps {
  /** Stable panel identifier */
  id: string;
  /** Minimum width in pixels. maxWidth is derived as minWidth × 2 */
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
      {children}
      <ResizeHint />
    </div>
  );
}

// ─── Separator drag context ──────────────────────────────────────────────────

interface SeparatorDragContextValue {
  startDrag: (separatorIndex: number, startX: number) => void;
  applyKeyboardStep: (separatorIndex: number, delta: number) => void;
  toggleCollapse: (separatorIndex: number) => void;
  getPanels: () => PanelEntry[];
  getWidths: () => Record<string, number>;
}

const SeparatorDragContext = createContext<SeparatorDragContextValue | null>(null);

// ─── ResizableSeparator ──────────────────────────────────────────────────────

const KEYBOARD_STEP = 20;

export interface SeparatorProps {
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragCtx || !ref.current) return;
    e.preventDefault();
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
        dragCtx.toggleCollapse(index);
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
      className={cn('select-none', className)}
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
