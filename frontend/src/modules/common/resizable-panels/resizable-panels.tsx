import { createContext, type ReactNode, type Ref, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { cn } from '~/utils/cn';

// Rules & visual examples → resizable-panels.md

interface PanelConfig {
  id: string;
  minWidth: number;
  collapsedWidth: number;
  collapsible: boolean;
}

interface PanelEntry extends PanelConfig {
  element: HTMLDivElement;
}

interface HintState {
  panelId: string;
  /** The panel's side that faces the dragged separator */
  side: 'left' | 'right';
  /** `cover`: the neighbour of an expanding panel, which the curtain covers by the width that panel takes */
  mode: 'collapse' | 'expand' | 'cover';
  progress: number;
  /** Curtain width at full progress in px; 0 draws none */
  reach: number;
}

interface LayoutResult {
  widths: Record<string, number>;
  hints: HintState[];
  /** G12: true when the expand threshold (G3) has been passed this frame */
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

// Idempotent and DOM-free: dragging backward re-evaluates from initialWidths and reverses.
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

  // Expand threshold (G3)
  if (growPanel && collapsedAtStart.has(growPanel.id) && growPanel.collapsible) {
    const expandThreshold = growPanel.minWidth - growPanel.collapsedWidth;
    if (absDx < expandThreshold) {
      const progress = absDx / expandThreshold;
      hints.push({ panelId: growPanel.id, side: draggingLeft ? 'left' : 'right', mode: 'expand', progress, reach: 0 });
      const neighbour = panels[draggingLeft ? separatorIndex : separatorIndex + 1];
      if (neighbour) hints.push({ panelId: neighbour.id, side: draggingLeft ? 'right' : 'left', mode: 'cover', progress, reach: expandThreshold });
      return { widths: { ...initialWidths }, hints };
    }
  }

  const isExpandingFromCollapsed = !!(growPanel && collapsedAtStart.has(growPanel.id) && growPanel.collapsible);

  // Victim list (G1, G9)
  const victimIndices: number[] = [];
  if (draggingLeft) {
    for (let i = separatorIndex; i >= 0; i--) victimIndices.push(i);
  } else {
    for (let i = separatorIndex + 1; i < panels.length; i++) victimIndices.push(i);
  }

  let remaining = absDx;
  const expandCost = isExpandingFromCollapsed && growPanel ? growPanel.minWidth - growPanel.collapsedWidth : 0;
  // Overflow mode funds the expand from trailing gap (O1); autoFill makes victims fund it.
  if (expandCost > 0 && !autoFill) {
    remaining -= expandCost;
  }

  let totalFreed = 0;
  let collapseFreed = 0;

  const directVictimIndex = victimIndices[0];

  const growInitial = growPanel ? (initialWidths[growPanel.id] ?? growPanel.minWidth) : 0;

  if (perPanelCascade) {
    // G11 phase 1: shrink all victims to minWidth, nearest first
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

    // G11 phase 2: per-panel collapse, nearest first
    if (remaining > 0) {
      for (const vi of victimIndices) {
        const victim = panels[vi];
        if (!victim || remaining <= 0) break;
        if (collapsedAtStart.has(victim.id)) continue;
        if (!victim.collapsible) continue;

        // G10: in autoFill, block direct-victim collapse until shrinking funds the expand
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
            reach: victim.minWidth - victim.collapsedWidth,
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
    // G9 phase 1: shrink all victims toward minWidth
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

    // G9 phase 2: collapse victims, only once all are at min
    if (remaining > 0) {
      for (const vi of victimIndices) {
        const victim = panels[vi];
        if (!victim || remaining <= 0) break;
        if (collapsedAtStart.has(victim.id)) continue;
        if (!victim.collapsible) continue;

        // G10: overflow gets a free expand from trailing gap, so the block is autoFill only
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
            reach: victim.minWidth - victim.collapsedWidth,
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
          // Layout freezes at minWidth inside the collapse zone
          widths[victim.id] = victim.minWidth;
          break;
        }

        widths[victim.id] = clampedWidth;
        break;
      }
    }
  }

  // Let the growing panel absorb freed pixels; final redistribution clamps it to viewport.
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

/** Panel content the other collapse state lacks: fades out with a resize hint, and fades in when its panel opens. For `fade="marked"` panels. */
export const hintFadeOut = 'opacity-[var(--content-opacity,1)] in-data-opening:animate-in in-data-opening:fade-in';

/** Content only the collapsed state shows, previewed in the expanded panel: fades in with a collapse hint. */
export const hintFadeIn = 'opacity-[calc(1_-_var(--content-opacity,1))]';

const curtainPleats = 'repeating-linear-gradient(90deg, transparent 0 9px, color-mix(in oklch, var(--foreground) 4%, transparent) 9px 14px)';

// A curtain drawn from the dragged separator, its leading edge lit at the pointer's height
function ResizeHint() {
  return (
    <div
      data-resize-hint=""
      className="pointer-events-none absolute inset-y-0 right-0 z-999 flex data-[side=left]:right-auto data-[side=left]:left-0 data-[side=left]:flex-row-reverse"
      style={{ opacity: 'var(--hint-strength, 0)' }}
    >
      {/* Grows into the handle it hands over to: at the snap the dragged separator lands on this edge */}
      <div
        className="relative shrink-0 rounded bg-primary"
        style={{ width: 'calc(2px + (var(--separator-width, 2px) - 2px) * var(--hint-strength, 0))' }}
      >
        <div
          className="absolute top-(--hint-y) left-1/2 h-40 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, color-mix(in oklch, var(--primary) 35%, transparent), transparent)' }}
        />
      </div>
      <div className="grow" style={{ backgroundColor: 'color-mix(in oklch, var(--card) 92%, transparent)', backgroundImage: curtainPleats }} />
    </div>
  );
}

// Eased so the curtain answers the first pixels of the zone and settles as it nears its reach
const curtainProgress = (hint: HintState) => (hint.reach ? 1 - (1 - hint.progress) ** 2 : 0);

function showResizeHint(element: HTMLDivElement, hint: HintState, clientY: number) {
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

function clearResizeHint(element: HTMLDivElement) {
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
  className?: string;
  children: ReactNode;
}

export function ResizablePanelGroup({ id, defaultLayout, onLayoutChanged, onCollapseChange, onReady, className, children }: PanelGroupProps) {
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

  const applyWidths = () => {
    for (const panel of panelsRef.current) {
      const w = widthsRef.current[panel.id] ?? panel.minWidth;
      panel.element.style.width = `${w}px`;
      panel.element.style.flexShrink = '0';
    }
    updateSeparatorAria();
  };

  const setWidth = (panel: PanelEntry, width: number) => {
    const prevWidth = widthsRef.current[panel.id] ?? panel.minWidth;
    widthsRef.current[panel.id] = width;

    const wasCollapsed = prevWidth <= panel.collapsedWidth;
    const isCollapsed = width <= panel.collapsedWidth;
    if (panel.collapsible && wasCollapsed !== isCollapsed) {
      onCollapseChangeRef.current?.(panel.id, isCollapsed);
      if (!isCollapsed) markOpening(panel.element);
    }

    if (width > panel.collapsedWidth) expandedWidthsRef.current[panel.id] = width;
  };

  const applyLayoutResult = (result: LayoutResult, clientY: number) => {
    for (const panel of panelsRef.current) {
      const newW = result.widths[panel.id];
      if (newW !== undefined) setWidth(panel, newW);
    }

    const hintedPanelIds = new Set(result.hints.map((h) => h.panelId));
    for (const panel of panelsRef.current) {
      if (!hintedPanelIds.has(panel.id)) clearResizeHint(panel.element);
    }
    let handoff = 0;
    for (const hint of result.hints) {
      const panel = panelsRef.current.find((p) => p.id === hint.panelId);
      if (panel) showResizeHint(panel.element, hint, clientY);
      handoff = Math.max(handoff, curtainProgress(hint));
    }
    const drag = dragRef.current;
    if (drag) separatorsRef.current.get(drag.separatorIndex)?.style.setProperty('--hint-strength', `${handoff}`);

    applyWidths();
  };

  const getWidths = (): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const panel of panelsRef.current) {
      result[panel.id] = widthsRef.current[panel.id] ?? panel.minWidth;
    }
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
    const growIndex = draggingLeft ? separatorIndex + 1 : separatorIndex;
    const victim = panels[victimIndex];
    const grower = panels[growIndex];
    if (!victim || !grower) return;

    const victimCurrent = widthsRef.current[victim.id] ?? victim.minWidth;
    const growerCurrent = widthsRef.current[grower.id] ?? grower.minWidth;
    const step = Math.abs(delta);

    let victimShrunk = 0;
    const victimIsCollapsed = victim.collapsible && victimCurrent <= victim.collapsedWidth;

    if (!victimIsCollapsed) {
      // Keyboard steps clamp without snap-collapse; Enter collapses
      const floor = victim.collapsible ? victim.collapsedWidth : victim.minWidth;
      const newVictimW = Math.max(floor, victimCurrent - step);
      victimShrunk = victimCurrent - newVictimW;
      if (victimShrunk > 0) setWidth(victim, newVictimW);
    }

    // Zero-sum: the grower only takes what the victim freed
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
    sortPanels();
    const leftPanel = panelsRef.current[separatorIndex];
    if (leftPanel) togglePanel(leftPanel.id);
  };

  const startDrag = (separatorIndex: number, startX: number) => {
    sortPanels();
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

        // Dragging left: the farthest victim is panel 0
        const leftLastVictim = panelsRef.current[0];
        if (leftLastVictim && !collapsedAtStart.has(leftLastVictim.id)) {
          const r = leftLastVictim.element.getBoundingClientRect();
          if (r.left < parentRect.left) perPanelCascade.left = true;
        }

        // Dragging right: the farthest victim is the last panel
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

    // clientWidth leaves out the border, which the board draws in the background color
    const separatorWidth = separatorsRef.current.get(separatorIndex)?.clientWidth;
    if (separatorWidth) containerRef.current?.style.setProperty('--separator-width', `${separatorWidth}px`);

    setCursorOverride('col-resize');
  };

  const cleanupDrag = () => {
    dragRef.current = null;
    prevContainerWidthRef.current = 0; // Force observer to redistribute after drag
    clearCursorOverride();
    containerRef.current?.style.removeProperty('--separator-width');
    for (const panel of panelsRef.current) clearResizeHint(panel.element);
    for (const separator of separatorsRef.current.values()) separator.style.removeProperty('--hint-strength');
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

  // Reordering moves panel elements without re-registering them, so every separator-index lookup re-sorts first.
  const sortPanels = () => {
    panelsRef.current.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
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
      element.setAttribute('aria-controls', right ? `${left.element.id} ${right.element.id}` : left.element.id);
      element.setAttribute('aria-valuemin', `${left.collapsible ? left.collapsedWidth : left.minWidth}`);
      element.setAttribute('aria-valuemax', `${left.minWidth * 2}`);
      element.setAttribute('aria-valuenow', `${Math.round(widthsRef.current[left.id] ?? left.minWidth)}`);
    }
  };

  const unregisterSeparator = (index: number) => {
    separatorsRef.current.delete(index);
  };

  const getSeparatorSpace = () => {
    let sepSpace = 0;
    for (const sep of separatorsRef.current.values()) {
      const style = getComputedStyle(sep);
      sepSpace += sep.getBoundingClientRect().width + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight);
    }
    return sepSpace;
  };

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
      // The pre-pass clamp may have changed widths even when ratio is ~1
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
      if (isCollapsed) {
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
      let newW = Math.max(panel.minWidth, isLast ? target - distributed : Math.floor(w * ratio));
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

    const observer = new ResizeObserver(() => handleResize());
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
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const ppc = dx < 0 ? drag.perPanelCascade.left : drag.perPanelCascade.right;
      const result = resolveLayout(panelsRef.current, drag.separatorIndex, drag.initialWidths, drag.collapsedAtStart, dx, drag.autoFill, ppc);

      applyLayoutResult(result, e.clientY);
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

  // Panels and separators re-register whenever this value changes, which re-measures and aborts a running drag.
  // The functions only touch refs, so the first render's copies stay valid and the value follows `id` alone.
  const [registry] = useState(() => ({ registerPanel, unregisterPanel, registerSeparator, unregisterSeparator }));
  const ctxValue = useMemo<PanelGroupContextValue>(() => ({ groupId: id, ...registry }), [id, registry]);

  const dragCtx: SeparatorDragContextValue = { startDrag, applyKeyboardStep, toggleCollapseAtSeparator };

  return (
    <PanelGroupContext.Provider value={ctxValue}>
      <SeparatorDragContext.Provider value={dragCtx}>
        <div ref={containerRef} className={className} data-panel-group={id} style={{ display: 'flex', overflow: 'visible' }}>
          {children}
        </div>
      </SeparatorDragContext.Provider>
    </PanelGroupContext.Provider>
  );
}

interface PanelProps {
  /** Stable panel identifier */
  id: string;
  /** Minimum width in pixels */
  minWidth: number;
  /** Width when collapsed in pixels (default: 0). Must be < minWidth. */
  collapsedWidth?: number;
  /** Whether the panel can be collapsed by dragging past the halfway point */
  collapsible?: boolean;
  /** What a resize hint fades: all content (default), or only elements carrying `hintFadeOut` / `hintFadeIn` */
  fade?: 'all' | 'marked';
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
  fade = 'all',
  className,
  children,
  ref,
  ...rest
}: PanelProps) {
  const ctx = useContext(PanelGroupContext);
  const internalRef = useRef<HTMLDivElement | null>(null);
  const domId = useId();

  const setRef = (el: HTMLDivElement | null) => {
    internalRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  useEffect(() => {
    const el = internalRef.current;
    if (!el || !ctx) return;
    const entry: PanelEntry = { id, element: el, minWidth, collapsedWidth, collapsible };
    ctx.registerPanel(entry);
    return () => ctx.unregisterPanel(id);
  }, [id, minWidth, collapsedWidth, collapsible, ctx]);

  return (
    <div
      ref={setRef}
      id={domId}
      className={className}
      data-panel={id}
      // clip, not hidden: hidden makes this a scroll container and captures the panel's sticky elements
      style={{ overflow: 'clip', position: 'relative', flexShrink: 0 }}
      {...rest}
    >
      <div className="h-full" style={fade === 'all' ? { opacity: 'var(--content-opacity, 1)' } : undefined}>
        {children}
      </div>
      <ResizeHint />
    </div>
  );
}

interface SeparatorDragContextValue {
  startDrag: (separatorIndex: number, startX: number) => void;
  applyKeyboardStep: (separatorIndex: number, delta: number) => void;
  toggleCollapseAtSeparator: (separatorIndex: number) => void;
}

const SeparatorDragContext = createContext<SeparatorDragContextValue | null>(null);

const keyboardStep = 20;

interface SeparatorProps {
  /** The index of this separator among siblings (0-based). Required for drag targeting. */
  index: number;
  className?: string;
  children?: ReactNode;
  /** Accessible name; defaults to a generic "resize panels". Pass one that names the panel it resizes. */
  'aria-label'?: string;
  [key: `data-${string}`]: string | undefined;
}

export function ResizableSeparator({ index, className, children, 'aria-label': ariaLabel, ...rest }: SeparatorProps) {
  const { t } = useTranslation();
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
        dragCtx.applyKeyboardStep(index, -keyboardStep);
        break;
      case 'ArrowRight':
        e.preventDefault();
        dragCtx.applyKeyboardStep(index, keyboardStep);
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

  return (
    <div
      ref={ref}
      // biome-ignore lint/a11y/useAriaPropsForRole: the group writes aria-valuenow once panels register (updateSeparatorAria)
      role="separator"
      aria-label={ariaLabel ?? t('c:resize_panels')}
      // The bar stands upright between two side-by-side panels and moves left and right
      aria-orientation="vertical"
      tabIndex={0}
      data-separator="inactive"
      // Consumers draw focus in the bar's own color: a ring has no room between panels. outline-hidden keeps the forced-colors outline.
      className={cn('select-none outline-hidden', className)}
      style={{
        touchAction: 'none',
        cursor: 'col-resize',
        flexShrink: 0,
        // The curtain's leading edge ends where this separator lands after the snap, so the separator yields to it
        opacity: 'calc(1 - 0.65 * var(--hint-strength, 0))',
        scale: 'calc(1 - 0.6 * var(--hint-strength, 0)) 1',
      }}
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
