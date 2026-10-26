import type { KeyboardEventHandler, PointerEventHandler, ReactNode } from 'react';
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

// Rules & visual examples → resizable-panels.md

interface PanelConfig {
  id: string;
  minWidth: number;
  collapsedWidth: number;
  collapsible: boolean;
}

interface PanelEntry extends PanelConfig {
  element: HTMLElement;
}

interface HintData {
  panelId: string;
  /** The panel's side that faces the dragged separator */
  side: 'left' | 'right';
  /** `cover`: the neighbour of an expanding panel, which the curtain covers by the width that panel takes */
  mode: 'collapse' | 'expand' | 'cover';
  /** 0 to 1 across the hint's zone */
  progress: number;
  /** Curtain width at full progress in px; 0 draws none */
  reach: number;
}

interface LayoutResult {
  widths: Record<string, number>;
  hints: HintData[];
}

interface DragState {
  separatorIndex: number;
  startX: number;
  /** The mode (G6), fixed at drag start; false is overflow */
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
  startDrag: (separatorIndex: number, startX: number) => void;
  applyKeyboardStep: (separatorIndex: number, delta: number) => void;
  toggleCollapseAtSeparator: (separatorIndex: number) => void;
}

const PanelGroupContext = createContext<PanelGroupContextValue | null>(null);

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
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== cursorStyleSheet);
    cursorStyleSheet = null;
  }
}

/**
 * The ideal width of an expanded panel, as a factor of its `minWidth` (G6).
 * @public
 */
export const idealWidthFactor = 1.25;

// G2: past this width a shrinking victim collapses; before it, it holds minWidth
const collapseSnapPoint = (panel: PanelConfig) => (panel.collapsedWidth + panel.minWidth) / 2.2;

function collapseProgress(panel: PanelConfig, rawWidth: number): number {
  const snapPoint = collapseSnapPoint(panel);
  if (rawWidth >= panel.minWidth || rawWidth <= snapPoint) return 0;
  return (panel.minWidth - rawWidth) / (panel.minWidth - snapPoint);
}

// Idempotent and DOM-free: dragging backward re-evaluates from initialWidths and reverses.
function resolveLayout(panels: PanelConfig[], drag: DragState, dx: number): LayoutResult {
  const { separatorIndex, initialWidths, collapsedAtStart, autoFill } = drag;
  const widths = { ...initialWidths };
  const hints: HintData[] = [];

  if (dx === 0) return { widths, hints };

  const draggingLeft = dx < 0;
  const absDx = Math.abs(dx);

  // G1: the panel the separator moves away from grows
  const growerIndex = draggingLeft ? separatorIndex + 1 : separatorIndex;
  const grower: PanelConfig | undefined = panels[growerIndex];
  const isExpandingFromCollapsed = !!grower?.collapsible && collapsedAtStart.has(grower.id);
  const expandCost = grower && isExpandingFromCollapsed ? grower.minWidth - grower.collapsedWidth : 0;

  // Expand gate (G3)
  if (isExpandingFromCollapsed && absDx < expandCost) {
    const progress = absDx / expandCost;
    hints.push({ panelId: grower.id, side: draggingLeft ? 'left' : 'right', mode: 'expand', progress, reach: 0 });
    const neighbour = panels[draggingLeft ? separatorIndex : separatorIndex + 1];
    if (neighbour) hints.push({ panelId: neighbour.id, side: draggingLeft ? 'right' : 'left', mode: 'cover', progress, reach: expandCost });
    return { widths, hints };
  }

  // Victim list (G1, G9)
  const victimIndices: number[] = [];
  if (draggingLeft) {
    for (let i = separatorIndex; i >= 0; i--) victimIndices.push(i);
  } else {
    for (let i = separatorIndex + 1; i < panels.length; i++) victimIndices.push(i);
  }

  let remaining = absDx;
  // Overflow mode funds the expand from trailing gap (O2); autoFill makes victims fund it.
  if (expandCost > 0 && !autoFill) {
    remaining -= expandCost;
  }

  let totalFreed = 0;
  let collapseFreed = 0;

  const directVictimIndex = victimIndices[0];

  const growerInitialWidth = grower ? (initialWidths[grower.id] ?? grower.minWidth) : 0;

  // G9 phase 1: shrink all victims toward minWidth
  for (const victimIndex of victimIndices) {
    const victim = panels[victimIndex];
    if (!victim || remaining <= 0) break;
    if (collapsedAtStart.has(victim.id)) continue;

    const initialWidth = initialWidths[victim.id] ?? victim.minWidth;
    const shrinkRoom = initialWidth - victim.minWidth;
    if (shrinkRoom <= 0) continue;

    const consumed = Math.min(shrinkRoom, remaining);
    widths[victim.id] = initialWidth - consumed;
    remaining -= consumed;
    totalFreed += consumed;
  }

  // G9 phase 2: collapse victims nearest first, only once all are at min
  if (remaining > 0) {
    for (const victimIndex of victimIndices) {
      const victim = panels[victimIndex];
      if (!victim || remaining <= 0) break;
      if (collapsedAtStart.has(victim.id)) continue;
      if (!victim.collapsible) continue;

      // G10: overflow gets a free expand from trailing gap, so the block is autoFill only
      if (autoFill && isExpandingFromCollapsed && victimIndex === directVictimIndex && totalFreed < expandCost) {
        continue;
      }

      const rawWidth = victim.minWidth - remaining;

      // Collapse hint (G4)
      const progress = collapseProgress(victim, rawWidth);
      if (progress > 0) {
        hints.push({
          panelId: victim.id,
          side: draggingLeft ? 'right' : 'left',
          mode: 'collapse',
          progress,
          reach: victim.minWidth - victim.collapsedWidth,
        });
      }

      if (rawWidth >= collapseSnapPoint(victim)) {
        // Layout freezes at minWidth inside the collapse zone
        widths[victim.id] = victim.minWidth;
        break;
      }

      const consumed = victim.minWidth - victim.collapsedWidth;
      widths[victim.id] = victim.collapsedWidth;
      remaining -= consumed;
      collapseFreed += consumed;
    }
  }

  // Let the growing panel absorb freed pixels; final redistribution clamps it to viewport.
  if (grower) {
    let growDelta = totalFreed;

    if (isExpandingFromCollapsed) {
      const totalAvailable = growDelta + collapseFreed;
      const extraGrowth = autoFill ? Math.max(0, totalAvailable - expandCost) : totalAvailable;
      widths[grower.id] = grower.minWidth + extraGrowth;
    } else if (!collapsedAtStart.has(grower.id)) {
      growDelta += collapseFreed;
      widths[grower.id] = growerInitialWidth + growDelta;
    }
  }

  return { widths, hints };
}

/** Panel content the other collapse state lacks: fades out with a resize hint, and fades in when its panel opens. For `fade="marked"` panels. */
export const hintFadeOut = tw('in-data-opening:fade-in in-data-opening:animate-in opacity-(--content-opacity,1)');

/** Content only the collapsed state shows, previewed in the expanded panel: fades in with a collapse hint. */
export const hintFadeIn = tw('opacity-[calc(1_-_var(--content-opacity,1))]');

const curtainPleats = 'repeating-linear-gradient(90deg, transparent 0 9px, color-mix(in oklch, var(--foreground) 4%, transparent) 9px 14px)';

// A curtain drawn from the dragged separator, its leading edge lit at the pointer's height
function ResizeHint() {
  return (
    <div
      data-resize-hint=""
      className="pointer-events-none absolute inset-y-0 right-0 z-999 flex opacity-(--hint-strength,0) data-[side=left]:right-auto data-[side=left]:left-0 data-[side=left]:flex-row-reverse"
    >
      {/* Widens to the separator's width: at the snap the dragged separator stops on this edge (G4) */}
      <div
        className="relative shrink-0 rounded bg-primary"
        style={{ width: 'calc(2px + (var(--separator-width, 2px) - 2px) * var(--hint-strength, 0))' }}
      >
        <div
          className="absolute top-(--hint-y) left-1/2 h-40 w-12 -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(closest-side, color-mix(in oklch, var(--primary) 35%, transparent), transparent)' }}
        />
      </div>
      <div className="grow bg-card/92" style={{ backgroundImage: curtainPleats }} />
    </div>
  );
}

// Eased so the curtain answers the first pixels of the zone and settles as it nears its reach
const curtainProgress = (hint: HintData) => (hint.reach ? 1 - (1 - hint.progress) ** 2 : 0);

function showResizeHint(element: HTMLElement, hint: HintData, clientY: number) {
  element.setAttribute('data-resizing', `${hint.mode}-${hint.side}`);
  if (hint.mode !== 'cover') element.style.setProperty('--content-opacity', `${1 - hint.progress}`);

  const curtain = element.querySelector<HTMLElement>(':scope > [data-resize-hint]');
  if (!curtain) return;
  const strength = curtainProgress(hint);
  curtain.dataset.side = hint.side;
  curtain.style.width = `${strength * hint.reach}px`;
  curtain.style.setProperty('--hint-strength', `${strength}`);
  curtain.style.setProperty('--hint-y', `${clientY - element.getBoundingClientRect().top}px`);
}

function clearResizeHint(element: HTMLElement) {
  if (!element.hasAttribute('data-resizing')) return;
  element.removeAttribute('data-resizing');
  element.style.removeProperty('--content-opacity');
  const curtain = element.querySelector<HTMLElement>(':scope > [data-resize-hint]');
  if (!curtain) return;
  curtain.style.removeProperty('width');
  curtain.style.removeProperty('--hint-strength');
  curtain.style.removeProperty('--hint-y');
}

const openingTimers = new WeakMap<HTMLElement, number>();

// The window outlasts the render that swaps in the expanded content, so hintFadeOut content mounts while it is set
function markOpening(element: HTMLElement) {
  clearTimeout(openingTimers.get(element));
  element.setAttribute('data-opening', '');
  openingTimers.set(
    element,
    window.setTimeout(() => element.removeAttribute('data-opening'), 300),
  );
}

export interface PanelGroupApi {
  /** No-op when the panel is already expanded */
  expandPanel: (panelId: string) => void;
  togglePanel: (panelId: string) => void;
}

interface ResizablePanelGroupProps {
  /** A new id re-registers every panel against `defaultLayout` */
  id: string;
  /** Widths as { panelId: pixels }, read whenever a panel registers */
  defaultLayout?: Record<string, number>;
  /** Fired after drag ends or keyboard resize, with the final { panelId: pixels } layout */
  onLayoutChanged?: (layout: Record<string, number>) => void;
  /** Fires with a collapsible panel's state when it registers and on each change; collapsed is width <= collapsedWidth */
  onCollapseChange?: (panelId: string, collapsed: boolean) => void;
  /** Called after mount with imperative methods for external panel control. */
  onReady?: (api: PanelGroupApi) => void;
  className?: string;
  children: ReactNode;
}

export function ResizablePanelGroup({
  id,
  defaultLayout,
  onLayoutChanged,
  onCollapseChange,
  onReady,
  className,
  children,
}: ResizablePanelGroupProps) {
  const panelsRef = useRef<PanelEntry[]>([]);
  const widthsRef = useRef<Record<string, number>>({});
  const dragRef = useRef<DragState | null>(null);
  const expandedWidthsRef = useRef<Record<string, number>>({});
  const separatorsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const onLayoutChangedRef = useLatestRef(onLayoutChanged);
  const onCollapseChangeRef = useLatestRef(onCollapseChange);
  const onReadyRef = useLatestRef(onReady);
  const defaultLayoutRef = useLatestRef(defaultLayout);

  const widthOf = (panel: PanelConfig) => widthsRef.current[panel.id] ?? panel.minWidth;
  const isCollapsed = (panel: PanelConfig, width = widthOf(panel)) => panel.collapsible && width <= panel.collapsedWidth;

  const applyWidths = () => {
    for (const panel of panelsRef.current) panel.element.style.width = `${widthOf(panel)}px`;
    updateSeparatorAria();
  };

  const setWidth = (panel: PanelEntry, width: number) => {
    const wasCollapsed = isCollapsed(panel);
    widthsRef.current[panel.id] = width;

    const collapsed = isCollapsed(panel, width);
    if (wasCollapsed !== collapsed) {
      onCollapseChangeRef.current?.(panel.id, collapsed);
      if (!collapsed) markOpening(panel.element);
    }

    if (width > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = width;
  };

  // Writes the widths, refits the container and reports the settled layout
  const commitLayout = () => {
    applyWidths();
    updateContainerWidth();
    redistributePanels();
    onLayoutChangedRef.current?.(getWidths());
  };

  const applyLayoutResult = (result: LayoutResult, clientY: number) => {
    for (const panel of panelsRef.current) {
      const newWidth = result.widths[panel.id];
      if (newWidth !== undefined) setWidth(panel, newWidth);
    }

    const hintedPanelIds = new Set(result.hints.map((hint) => hint.panelId));
    for (const panel of panelsRef.current) {
      if (!hintedPanelIds.has(panel.id)) clearResizeHint(panel.element);
    }
    let handoff = 0;
    for (const hint of result.hints) {
      const panel = panelsRef.current.find((entry) => entry.id === hint.panelId);
      if (panel) showResizeHint(panel.element, hint, clientY);
      handoff = Math.max(handoff, curtainProgress(hint));
    }
    const drag = dragRef.current;
    if (drag) separatorsRef.current.get(drag.separatorIndex)?.style.setProperty('--hint-strength', `${handoff}`);

    applyWidths();
  };

  const getWidths = (): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const panel of panelsRef.current) result[panel.id] = widthOf(panel);
    return result;
  };

  // Mode detection (G6). Measures the parent: updateContainerWidth() can set min-width on the container.
  const computeAutoFill = () => {
    const container = containerRef.current;
    if (!container) return true;
    const parentWidth = (container.parentElement ?? container).getBoundingClientRect().width;
    return getIdealPanelSum() + getSeparatorSpace() <= parentWidth;
  };

  const applyKeyboardStep = (separatorIndex: number, delta: number) => {
    sortPanels();
    // Compute mode before mutating widths so getBoundingClientRect is fresh
    const autoFill = computeAutoFill();

    const panels = panelsRef.current;
    const draggingLeft = delta < 0;
    const victimIndex = draggingLeft ? separatorIndex : separatorIndex + 1;
    const growerIndex = draggingLeft ? separatorIndex + 1 : separatorIndex;
    const victim = panels[victimIndex];
    const grower = panels[growerIndex];
    if (!victim || !grower) return;

    const victimWidth = widthOf(victim);
    const growerWidth = widthOf(grower);
    const step = Math.abs(delta);

    let victimShrunk = 0;

    if (!isCollapsed(victim, victimWidth)) {
      // Keyboard steps clamp without snap-collapse; Enter collapses
      const minVictimWidth = victim.collapsible ? victim.collapsedWidth : victim.minWidth;
      const newVictimWidth = Math.max(minVictimWidth, victimWidth - step);
      victimShrunk = victimWidth - newVictimWidth;
      if (victimShrunk > 0) setWidth(victim, newVictimWidth);
    }

    // Zero-sum: the grower only takes what the victim freed
    if (victimShrunk > 0) {
      if (isCollapsed(grower, growerWidth)) {
        // Expand-on-reverse: collapsed grower snaps to minWidth
        setWidth(grower, grower.minWidth);
      } else {
        const maxGrow = autoFill ? Number.MAX_SAFE_INTEGER : grower.minWidth * 2;
        setWidth(grower, Math.max(grower.minWidth, Math.min(maxGrow, growerWidth + victimShrunk)));
      }
    }

    commitLayout();
  };

  const togglePanel = (panelId: string) => {
    const panel = panelsRef.current.find((entry) => entry.id === panelId);
    if (!panel?.collapsible) return;

    setWidth(panel, isCollapsed(panel) ? (expandedWidthsRef.current[panelId] ?? panel.minWidth) : panel.collapsedWidth);
    commitLayout();
  };

  const expandPanel = (panelId: string) => {
    const panel = panelsRef.current.find((entry) => entry.id === panelId);
    if (panel && isCollapsed(panel)) togglePanel(panelId);
  };

  const toggleCollapseAtSeparator = (separatorIndex: number) => {
    sortPanels();
    const leftPanel = panelsRef.current[separatorIndex];
    if (leftPanel) togglePanel(leftPanel.id);
  };

  const startDrag = (separatorIndex: number, startX: number) => {
    sortPanels();
    const collapsedAtStart = new Set<string>();
    const initialWidths: Record<string, number> = {};

    for (const panel of panelsRef.current) {
      initialWidths[panel.id] = widthOf(panel);
      if (isCollapsed(panel)) collapsedAtStart.add(panel.id);
    }

    dragRef.current = { separatorIndex, startX, autoFill: computeAutoFill(), initialWidths, collapsedAtStart };

    // clientWidth leaves out the border, which the board draws in the background color
    const separatorWidth = separatorsRef.current.get(separatorIndex)?.clientWidth;
    if (separatorWidth) containerRef.current?.style.setProperty('--separator-width', `${separatorWidth}px`);

    setCursorOverride('col-resize');
  };

  const cleanupDrag = () => {
    dragRef.current = null;
    clearCursorOverride();
    containerRef.current?.style.removeProperty('--separator-width');
    for (const panel of panelsRef.current) clearResizeHint(panel.element);
    for (const separator of separatorsRef.current.values()) {
      separator.style.removeProperty('--hint-strength');
      separator.removeAttribute('data-separator');
    }
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    cleanupDrag();
    commitLayout();
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

  // Reordering moves panel elements without re-registering them, so every separator-index lookup re-sorts first.
  const sortPanels = () => {
    panelsRef.current.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : position & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
    });
  };

  const initializePanel = (entry: PanelEntry) => {
    const width = defaultLayoutRef.current?.[entry.id] ?? expandedWidthsRef.current[entry.id] ?? entry.minWidth;
    widthsRef.current[entry.id] = width;

    if (entry.collapsible) onCollapseChangeRef.current?.(entry.id, isCollapsed(entry, width));
    if (width > entry.collapsedWidth) expandedWidthsRef.current[entry.id] = width;
  };

  const registerPanel = (entry: PanelEntry) => {
    const existingIndex = panelsRef.current.findIndex((panel) => panel.id === entry.id);
    if (existingIndex >= 0) panelsRef.current[existingIndex] = entry;
    else panelsRef.current.push(entry);

    sortPanels();
    initializePanel(entry);
    applyWidths();
    if (dragRef.current) abortDrag();
    updateContainerWidth();
  };

  const unregisterPanel = (panelId: string) => {
    panelsRef.current = panelsRef.current.filter((panel) => panel.id !== panelId);
    delete widthsRef.current[panelId];
    if (dragRef.current) abortDrag();
    updateContainerWidth();
    updateSeparatorAria();
  };

  const registerSeparator = (index: number, element: HTMLDivElement) => {
    separatorsRef.current.set(index, element);
    updateSeparatorAria();
  };

  // Separators render before panels register and resizes bypass React, so their value and neighbours are written here.
  const updateSeparatorAria = () => {
    sortPanels();
    for (const [index, element] of separatorsRef.current) {
      const left = panelsRef.current[index];
      if (!left) continue;
      const right = panelsRef.current[index + 1];
      const leftWidth = widthOf(left);
      // The most the left panel takes from its right neighbour: the neighbour shrinks to its collapsed or minimum width
      const maxWidth = right ? leftWidth + widthOf(right) - (right.collapsible ? right.collapsedWidth : right.minWidth) : leftWidth;
      element.setAttribute('aria-controls', right ? `${left.element.id} ${right.element.id}` : left.element.id);
      element.setAttribute('aria-valuemin', `${left.collapsible ? left.collapsedWidth : left.minWidth}`);
      element.setAttribute('aria-valuemax', `${Math.round(maxWidth)}`);
      element.setAttribute('aria-valuenow', `${Math.round(leftWidth)}`);
    }
  };

  const unregisterSeparator = (index: number) => {
    separatorsRef.current.delete(index);
  };

  const getSeparatorSpace = () => {
    let separatorSpace = 0;
    for (const separator of separatorsRef.current.values()) {
      const style = getComputedStyle(separator);
      separatorSpace += separator.getBoundingClientRect().width + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight);
    }
    return separatorSpace;
  };

  const getPanelSum = () => {
    let sum = 0;
    for (const panel of panelsRef.current) sum += widthOf(panel);
    return sum;
  };

  const getIdealPanelSum = () => {
    let sum = 0;
    for (const panel of panelsRef.current) sum += isCollapsed(panel) ? panel.collapsedWidth : panel.minWidth * idealWidthFactor;
    return sum;
  };

  const updateContainerWidth = () => {
    const container = containerRef.current;
    if (!container) return;

    if (computeAutoFill()) {
      container.style.minWidth = '';
      return;
    }

    const separatorSpace = getSeparatorSpace();
    // max(ideal, actual) keeps panels that grew past their ideal width from being shrunk.
    const targetWidth = Math.max(getIdealPanelSum(), getPanelSum()) + separatorSpace;
    container.style.minWidth = `${Math.ceil(targetWidth)}px`;
  };

  // Scale non-collapsed panels so their total matches the available container space.
  const redistributePanels = () => {
    const container = containerRef.current;
    if (!container) return false;

    const separatorSpace = getSeparatorSpace();
    const available = container.getBoundingClientRect().width - separatorSpace;
    if (available <= 0) return false;

    // Viewport clamp: no single panel should exceed the scroll parent's visible width
    const scrollParent = container.parentElement;
    const viewportWidth = scrollParent ? scrollParent.getBoundingClientRect().width - separatorSpace : available;

    let changed = false;
    for (const panel of panelsRef.current) {
      if (widthOf(panel) > viewportWidth && viewportWidth >= panel.minWidth) {
        widthsRef.current[panel.id] = viewportWidth;
        if (viewportWidth > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = viewportWidth;
        changed = true;
      }
    }

    const panelSum = getPanelSum();
    if (panelSum <= 0) return false;

    const ratio = available / panelSum;
    if (Math.abs(ratio - 1) < 0.005) {
      // The pre-pass clamp may have changed widths even when ratio is ~1
      if (changed) {
        applyWidths();
        updateContainerWidth();
      }
      return changed;
    }

    let allocated = 0;
    const expandedPanels: PanelEntry[] = [];
    for (const panel of panelsRef.current) {
      if (isCollapsed(panel)) {
        allocated += widthOf(panel);
      } else {
        expandedPanels.push(panel);
      }
    }

    const target = available - allocated;
    let distributed = 0;
    for (let i = 0; i < expandedPanels.length; i++) {
      const panel = expandedPanels[i];
      const width = widthOf(panel);
      const isLast = i === expandedPanels.length - 1;
      // Last panel absorbs rounding remainder to keep total exact
      let newWidth = Math.max(panel.minWidth, isLast ? target - distributed : Math.floor(width * ratio));
      newWidth = Math.min(newWidth, viewportWidth);
      distributed += newWidth;
      if (Math.abs(newWidth - width) >= 1) {
        widthsRef.current[panel.id] = newWidth;
        if (newWidth > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = newWidth;
        changed = true;
      }
    }

    if (changed) {
      applyWidths();
      updateContainerWidth();
    }
    return changed;
  };

  // Observe the container for auto-fill and its parent for fixed-min-width overflow resizing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      if (dragRef.current) return;

      // Resizing the parent can cross the autoFill/overflow threshold
      updateContainerWidth();

      if (redistributePanels()) {
        onLayoutChangedRef.current?.(getWidths());
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onReadyRef.current?.({ expandPanel, togglePanel });
  }, []);

  // A reorder re-renders the group but registers nothing
  useEffect(() => updateSeparatorAria());

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      applyLayoutResult(resolveLayout(panelsRef.current, drag, event.clientX - drag.startX), event.clientY);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', endDrag);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', endDrag);
      clearCursorOverride();
    };
  }, []);

  // Panels and separators re-register whenever this value changes, which re-measures and aborts a running drag.
  // The functions only touch refs, so the first render's copies stay valid and the value follows `id` alone.
  const [actions] = useState(() => ({
    registerPanel,
    unregisterPanel,
    registerSeparator,
    unregisterSeparator,
    startDrag,
    applyKeyboardStep,
    toggleCollapseAtSeparator,
  }));
  const contextValue = useMemo<PanelGroupContextValue>(() => ({ groupId: id, ...actions }), [id, actions]);

  return (
    <PanelGroupContext.Provider value={contextValue}>
      <div ref={containerRef} className={cn('flex', className)}>
        {children}
      </div>
    </PanelGroupContext.Provider>
  );
}

interface ResizablePanelProps {
  /** Stable panel identifier */
  id: string;
  /** Minimum width in pixels */
  minWidth: number;
  /** Width when collapsed in pixels (default: 0). Must be < minWidth. */
  collapsedWidth?: number;
  /** Whether the panel can be collapsed by dragging it past its collapse snap point (G2) */
  collapsible?: boolean;
  /** What a resize hint fades: all content (default), or only elements carrying `hintFadeOut` / `hintFadeIn` */
  fade?: 'all' | 'marked';
  /** Accessible name. A named section is a region, a landmark screen reader users can jump between; unnamed it stays generic. */
  label?: string;
  children?: ReactNode;
}

export function ResizablePanel({ id, minWidth, collapsedWidth = 0, collapsible = false, fade = 'all', label, children }: ResizablePanelProps) {
  const context = useContext(PanelGroupContext);
  const panelRef = useRef<HTMLElement>(null);
  const domId = useId();

  useEffect(() => {
    const element = panelRef.current;
    if (!element || !context) return;
    const entry: PanelEntry = { id, element, minWidth, collapsedWidth, collapsible };
    context.registerPanel(entry);
    return () => context.unregisterPanel(id);
  }, [id, minWidth, collapsedWidth, collapsible, context]);

  return (
    <section
      ref={panelRef}
      id={domId}
      data-panel={id}
      aria-label={label}
      // clip, not hidden: hidden makes this a scroll container and captures the panel's sticky elements
      className="relative shrink-0 overflow-clip"
    >
      <div className={cn('h-full', fade === 'all' && 'opacity-(--content-opacity,1)')}>{children}</div>
      <ResizeHint />
    </section>
  );
}

const keyboardStep = 20;

interface ResizableSeparatorProps {
  /** 0-based among the separators: separator i sits between panels i and i + 1 */
  index: number;
  className?: string;
  /** Accessible name; defaults to a generic "resize panels". Pass one that names the panel it resizes. */
  'aria-label'?: string;
}

export function ResizableSeparator({ index, className, 'aria-label': ariaLabel }: ResizableSeparatorProps) {
  const { t } = useTranslation();
  const context = useContext(PanelGroupContext);
  const separatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = separatorRef.current;
    if (!element || !context) return;
    context.registerSeparator(index, element);
    return () => context.unregisterSeparator(index);
  }, [index, context]);

  const lastPointerDownRef = useRef(0);

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!context || !separatorRef.current) return;
    event.preventDefault();

    const now = Date.now();
    if (now - lastPointerDownRef.current < 300) {
      lastPointerDownRef.current = 0;
      context.toggleCollapseAtSeparator(index);
      return;
    }
    lastPointerDownRef.current = now;

    separatorRef.current.setPointerCapture(event.pointerId);
    separatorRef.current.setAttribute('data-separator', 'drag');
    separatorRef.current.focus();
    context.startDrag(index, event.clientX);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!context) return;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        context.applyKeyboardStep(index, -keyboardStep);
        break;
      case 'ArrowRight':
        event.preventDefault();
        context.applyKeyboardStep(index, keyboardStep);
        break;
      case 'Home':
        event.preventDefault();
        context.applyKeyboardStep(index, -10000);
        break;
      case 'End':
        event.preventDefault();
        context.applyKeyboardStep(index, 10000);
        break;
      case 'Enter':
        event.preventDefault();
        context.toggleCollapseAtSeparator(index);
        break;
    }
  };

  return (
    <div
      ref={separatorRef}
      // biome-ignore lint/a11y/useAriaPropsForRole: the group writes aria-valuenow once panels register (updateSeparatorAria)
      role="separator"
      aria-label={ariaLabel ?? t('c:resize_panels')}
      // The bar stands upright between two side-by-side panels and moves left and right
      aria-orientation="vertical"
      tabIndex={0}
      // Consumers draw focus in the bar's own color: a ring has no room between panels. outline-hidden keeps the forced-colors outline.
      className={cn('shrink-0 cursor-col-resize touch-none select-none outline-hidden', className)}
      style={{
        // Thins and fades while the curtain's leading edge widens to take its place (G4)
        opacity: 'calc(1 - 0.65 * var(--hint-strength, 0))',
        scale: 'calc(1 - 0.6 * var(--hint-strength, 0)) 1',
      }}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}
