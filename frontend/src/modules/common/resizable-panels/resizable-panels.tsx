import type { KeyboardEventHandler, PointerEventHandler, ReactNode } from 'react';
import { createContext, useContext, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLatestRef } from '~/hooks/use-latest-ref';
import {
  type DragState,
  distributeWidths,
  fitPanels,
  type HintData,
  type LayoutResult,
  type PanelConfig,
  resolveEndDrag,
  resolveLayout,
} from '~/modules/common/resizable-panels/panel-layout';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

// Rules & visual examples → resizable-panels.md

interface PanelEntry extends PanelConfig {
  element: HTMLElement;
}

interface PanelGroupContextValue {
  groupId: string;
  registerPanel: (entry: PanelEntry) => void;
  unregisterPanel: (id: string) => void;
  registerSeparator: (index: number, element: HTMLDivElement) => void;
  unregisterSeparator: (index: number) => void;
  startDrag: (separatorIndex: number, startX: number, pointerId: number) => void;
  applyKeyboardStep: (separatorIndex: number, delta: number, toLimit?: boolean) => void;
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

const resizeSaveDelay = 150;

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
  /** The row always fits its parent, closing panels when there are too many, and `onLayoutChanged` reports what the user chose (F rules). Fixed for the group's lifetime. */
  mustFit?: boolean;
  /** Mode detection counts open panels at `minWidth`, not their ideal width (E2). The end handle switches it. */
  fit?: boolean;
  onFitChange?: (fit: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function ResizablePanelGroup({
  id,
  defaultLayout,
  onLayoutChanged,
  onCollapseChange,
  onReady,
  mustFit = false,
  fit = false,
  onFitChange,
  className,
  children,
}: ResizablePanelGroupProps) {
  const panelsRef = useRef<PanelEntry[]>([]);
  const widthsRef = useRef<Record<string, number>>({});
  const dragRef = useRef<(DragState & { pointerId: number; snapped?: boolean }) | null>(null);
  const expandedWidthsRef = useRef<Record<string, number>>({});
  const panelChangePendingRef = useRef(false);
  const unregisteredPanelsRef = useRef<Set<string>>(new Set());
  const mustFitRef = useLatestRef(mustFit);
  // F8: what the user chose. Rendered widths come from this, and only a user action writes it.
  const chosenRef = useRef<Record<string, number>>({});
  const chosenOpenRef = useRef<Record<string, number>>({});
  const autoCollapsedRef = useRef<string[]>([]);
  const recencyRef = useRef<string[]>([]);
  const fittedParentWidthRef = useRef(0);
  const resizeSaveRef = useRef(0);
  // Ahead of the prop: a switch applies at once, before the consumer renders it back
  const fitRef = useRef(fit);
  const separatorsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const fitLineRef = useRef<HTMLDivElement>(null);
  const onLayoutChangedRef = useLatestRef(onLayoutChanged);
  const onFitChangeRef = useLatestRef(onFitChange);
  const onCollapseChangeRef = useLatestRef(onCollapseChange);
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

  // Covers a pending resize save too
  const saveLayout = () => {
    clearTimeout(resizeSaveRef.current);
    onLayoutChangedRef.current?.(getWidths());
  };

  // P1: a resize refits on every frame, and each save re-renders the consumer
  const saveAfterResize = () => {
    clearTimeout(resizeSaveRef.current);
    resizeSaveRef.current = window.setTimeout(saveLayout, resizeSaveDelay);
  };

  // Writes the widths, refits the container and reports the settled layout
  const commitLayout = () => {
    applyWidths();
    updateContainerWidth();
    redistributePanels();
    saveLayout();
  };

  // E4: in proportion to the room, or at minWidth when not even that fits, which a refit alone would not shrink to
  const applyFit = () => {
    const parent = containerRef.current?.parentElement;
    if (fitRef.current && parent) {
      const open = panelsRef.current.filter((panel) => !isCollapsed(panel));
      const closed = panelsRef.current.reduce((sum, panel) => sum + (isCollapsed(panel) ? widthOf(panel) : 0), 0);
      const room = parent.getBoundingClientRect().width - getSeparatorSpace() - closed;
      const least = open.reduce((sum, panel) => sum + panel.minWidth, 0);
      setWidths(distributeWidths(open, Object.fromEntries(open.map((panel) => [panel.id, widthOf(panel)])), Math.max(room, least)));
    }
    commitLayout();
  };

  const setFit = (next: boolean) => {
    fitRef.current = next;
    onFitChangeRef.current?.(next);
    applyFit();
  };

  const isEndSeparator = (separatorIndex: number) => !mustFitRef.current && separatorIndex === panelsRef.current.length - 1;

  // Every width is in place before anyone hears of a change: a listener can call back into the group
  const setWidths = (widths: Record<string, number>) => {
    const flipped = panelsRef.current.filter((panel) => isCollapsed(panel) !== isCollapsed(panel, widths[panel.id] ?? widthOf(panel)));
    for (const panel of panelsRef.current) {
      if (widths[panel.id] !== undefined) widthsRef.current[panel.id] = widths[panel.id];
    }
    for (const panel of flipped) {
      const collapsed = isCollapsed(panel);
      onCollapseChangeRef.current?.(panel.id, collapsed);
      if (!collapsed) markOpening(panel.element);
    }
  };

  const touch = (panelIds: string[]) => {
    recencyRef.current = [...recencyRef.current.filter((id) => !panelIds.includes(id)), ...panelIds];
  };

  // The one place rendered widths come from in must-fit
  const fitRow = (keep: string[] = []) => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const parentWidth = parent.getBoundingClientRect().width;
    const available = parentWidth - getSeparatorSpace();
    if (available <= 0) return;
    fittedParentWidthRef.current = parentWidth;

    sortPanels();
    const focused = panelsRef.current.find((panel) => panel.element.contains(document.activeElement));
    const result = fitPanels({
      panels: panelsRef.current,
      chosen: chosenRef.current,
      autoCollapsed: autoCollapsedRef.current,
      available,
      recency: recencyRef.current,
      keep: focused ? [...keep, focused.id] : keep,
    });
    autoCollapsedRef.current = result.autoCollapsed;
    setWidths(result.widths);
    applyWidths();
  };

  const saveChosen = () => {
    const layout: Record<string, number> = {};
    for (const panel of panelsRef.current) {
      const width = chosenRef.current[panel.id];
      if (Number.isFinite(width)) layout[panel.id] = width;
    }
    onLayoutChangedRef.current?.(layout);
  };

  // A drag or key leaves the row as the user set it, so that becomes the choice; a panel the fit closed stays out of it
  const chooseRendered = () => {
    for (const panel of panelsRef.current) {
      if (!isCollapsed(panel)) {
        chosenRef.current[panel.id] = widthOf(panel);
        autoCollapsedRef.current = autoCollapsedRef.current.filter((id) => id !== panel.id);
      } else if (!autoCollapsedRef.current.includes(panel.id)) {
        closeChosen(panel);
      }
    }
  };

  const closeChosen = (panel: PanelConfig) => {
    const width = chosenRef.current[panel.id];
    if (width > panel.collapsedWidth) chosenOpenRef.current[panel.id] = width;
    chosenRef.current[panel.id] = panel.collapsedWidth;
  };

  const toggleFitted = (panel: PanelConfig) => {
    if (isCollapsed(panel)) {
      autoCollapsedRef.current = autoCollapsedRef.current.filter((id) => id !== panel.id);
      if (chosenRef.current[panel.id] <= panel.collapsedWidth) chosenRef.current[panel.id] = chosenOpenRef.current[panel.id] ?? panel.minWidth;
      touch([panel.id]);
      fitRow([panel.id]);
    } else {
      // F5
      if (panelsRef.current.filter((other) => !isCollapsed(other)).length <= 1) return;
      closeChosen(panel);
      fitRow();
    }
    saveChosen();
  };

  const commitFitted = (touched: string[]) => {
    chooseRendered();
    touch(touched);
    fitRow(touched);
    saveChosen();
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
    // The end handle stays: its gate curtain marks a release, not a separator handing over
    if (drag && !drag.end) separatorsRef.current.get(drag.separatorIndex)?.style.setProperty('--hint-strength', `${handoff}`);

    applyWidths();
  };

  const getWidths = (): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const panel of panelsRef.current) result[panel.id] = widthOf(panel);
    return result;
  };

  // Mode detection (G6). Measures the parent: updateContainerWidth() can set min-width on the container.
  const computeAutoFill = () => {
    if (mustFitRef.current) return true;
    const container = containerRef.current;
    if (!container) return true;
    const parentWidth = (container.parentElement ?? container).getBoundingClientRect().width;
    return getIdealPanelSum() + getSeparatorSpace() <= parentWidth;
  };

  // `toLimit` is Home/End: as far as the victim goes, closed if it can. An arrow stops at its minWidth.
  const applyKeyboardStep = (separatorIndex: number, delta: number, toLimit = false) => {
    sortPanels();
    // E6
    if (isEndSeparator(separatorIndex)) return setFit(delta < 0);

    const panels = panelsRef.current;
    const draggingLeft = delta < 0;
    const victim = panels[draggingLeft ? separatorIndex : separatorIndex + 1];
    const grower = panels[draggingLeft ? separatorIndex + 1 : separatorIndex];
    if (!victim || !grower) return;

    const victimBefore = widthOf(victim);
    const growerBefore = widthOf(grower);

    if (!isCollapsed(victim)) {
      const victimWidth = widthOf(victim);
      const growerWidth = widthOf(grower);
      const limit = toLimit && victim.collapsible ? victim.collapsedWidth : victim.minWidth;
      const newVictimWidth = toLimit ? limit : Math.max(limit, victimWidth - Math.abs(delta));
      const victimShrunk = Math.max(0, victimWidth - newVictimWidth);
      if (victimShrunk > 0) setWidth(victim, newVictimWidth);

      if (isCollapsed(grower, growerWidth)) setWidth(grower, grower.minWidth);
      else if (victimShrunk > 0) setWidth(grower, Math.max(grower.minWidth, growerWidth + victimShrunk));
    }

    if (mustFitRef.current) {
      if (widthOf(victim) !== victimBefore || widthOf(grower) !== growerBefore) commitFitted([grower.id]);
      return;
    }
    commitLayout();
  };

  const togglePanel = (panelId: string) => {
    const panel = panelsRef.current.find((entry) => entry.id === panelId);
    if (!panel?.collapsible) return;
    if (mustFitRef.current) return toggleFitted(panel);

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

  const startDrag = (separatorIndex: number, startX: number, pointerId: number) => {
    sortPanels();
    const collapsedAtStart = new Set<string>();
    const initialWidths: Record<string, number> = {};

    for (const panel of panelsRef.current) {
      initialWidths[panel.id] = widthOf(panel);
      if (isCollapsed(panel)) collapsedAtStart.add(panel.id);
    }

    const last = panelsRef.current.at(-1);
    const parentWidth = containerRef.current?.parentElement?.getBoundingClientRect().width ?? 0;
    const end =
      isEndSeparator(separatorIndex) && last
        ? { fit: fitRef.current, room: parentWidth - getSeparatorSpace(), reach: last.minWidth * (idealWidthFactor - 1) }
        : undefined;

    dragRef.current = {
      separatorIndex,
      startX,
      pointerId,
      autoFill: computeAutoFill(),
      mustFit: mustFitRef.current,
      initialWidths,
      collapsedAtStart,
      end,
    };

    // E3: where the row's end has to land
    const fitLine = fitLineRef.current;
    if (end && !end.fit && fitLine) {
      fitLine.style.left = `${parentWidth}px`;
      fitLine.hidden = false;
    }

    // clientWidth leaves out the border, which the board draws in the background color
    const separatorWidth = separatorsRef.current.get(separatorIndex)?.clientWidth;
    if (separatorWidth) containerRef.current?.style.setProperty('--separator-width', `${separatorWidth}px`);

    setCursorOverride('col-resize');
  };

  const cleanupDrag = () => {
    dragRef.current = null;
    clearCursorOverride();
    if (fitLineRef.current) {
      fitLineRef.current.hidden = true;
      fitLineRef.current.removeAttribute('data-snapped');
    }
    containerRef.current?.style.removeProperty('--separator-width');
    for (const panel of panelsRef.current) clearResizeHint(panel.element);
    for (const separator of separatorsRef.current.values()) {
      separator.style.removeProperty('--hint-strength');
      separator.removeAttribute('data-separator');
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    cleanupDrag();
    if (drag.end) {
      // E4: fit shares the room from the widths the row had before the drag
      setWidths(drag.initialWidths);
      return drag.snapped ? setFit(!drag.end.fit) : commitLayout();
    }
    if (!mustFitRef.current) return commitLayout();

    const grown = panelsRef.current.filter((panel) => widthOf(panel) > drag.initialWidths[panel.id]).map((panel) => panel.id);
    const moved = panelsRef.current.some((panel) => widthOf(panel) !== drag.initialWidths[panel.id]);
    if (moved) commitFitted(grown);
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
    if (mustFitRef.current) {
      chosenRef.current[entry.id] = width;
      autoCollapsedRef.current = autoCollapsedRef.current.filter((id) => id !== entry.id);
    }

    if (entry.collapsible) onCollapseChangeRef.current?.(entry.id, isCollapsed(entry, width));
    if (width > entry.collapsedWidth) expandedWidthsRef.current[entry.id] = width;
  };

  // Panels record themselves in a layout effect, which runs before the group's `useLatestRef` refs update, and one commit
  // can change several. So the first paint is right, everything that reads those refs waits for this one microtask.
  const schedulePanelChange = () => {
    if (panelChangePendingRef.current) return;
    panelChangePendingRef.current = true;
    queueMicrotask(() => {
      panelChangePendingRef.current = false;
      if (dragRef.current) abortDrag();

      const added = [...unregisteredPanelsRef.current];
      unregisteredPanelsRef.current.clear();
      const isAddition = added.length < panelsRef.current.length;
      sortPanels();
      for (const panel of panelsRef.current) {
        if (added.includes(panel.id)) initializePanel(panel);
      }
      applyWidths();

      if (!mustFitRef.current) return refit();
      // F3: a panel added next to others is the one just opened
      if (isAddition) touch(added);
      fitRow(isAddition ? added : []);
    });
  };

  const registerPanel = (entry: PanelEntry) => {
    const existingIndex = panelsRef.current.findIndex((panel) => panel.id === entry.id);
    if (existingIndex >= 0) panelsRef.current[existingIndex] = entry;
    else panelsRef.current.push(entry);

    unregisteredPanelsRef.current.add(entry.id);
    schedulePanelChange();
  };

  const unregisterPanel = (panelId: string) => {
    panelsRef.current = panelsRef.current.filter((panel) => panel.id !== panelId);
    delete widthsRef.current[panelId];
    unregisteredPanelsRef.current.delete(panelId);
    schedulePanelChange();
  };

  const registerSeparator = (index: number, element: HTMLDivElement) => {
    separatorsRef.current.set(index, element);
    updateSeparatorAria();
    schedulePanelChange();
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
      // A removed panel's separator stays registered until its own cleanup, and a detached element's margins parse to NaN
      if (!separator.isConnected) continue;
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
    const factor = fitRef.current ? 1 : idealWidthFactor;
    for (const panel of panelsRef.current) sum += isCollapsed(panel) ? panel.collapsedWidth : panel.minWidth * factor;
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

  // Resizing the parent can cross the autoFill/overflow threshold
  const refit = (save = saveLayout) => {
    updateContainerWidth();
    if (redistributePanels()) save();
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

    // R2: a pixel over would scroll the board sideways; a gap under a pixel is overflow mode's ceiled min-width
    const gap = available - panelSum;
    if (gap > -0.01 && gap < 1) {
      // The pre-pass clamp may have changed widths even when the row fits
      if (changed) {
        applyWidths();
        updateContainerWidth();
      }
      return changed;
    }

    const expandedPanels = panelsRef.current.filter((panel) => !isCollapsed(panel));
    const allocated = panelsRef.current.reduce((sum, panel) => sum + (isCollapsed(panel) ? widthOf(panel) : 0), 0);
    const weights = Object.fromEntries(expandedPanels.map((panel) => [panel.id, widthOf(panel)]));
    const shares = distributeWidths(expandedPanels, weights, available - allocated);

    for (const panel of expandedPanels) {
      const width = widthOf(panel);
      const newWidth = Math.min(shares[panel.id], viewportWidth);
      if (newWidth !== width) {
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
      if (!mustFitRef.current) return refit(saveAfterResize);

      // F9: list heights change this page's size all the time, and only a width can change the fit
      const parentWidth = container.parentElement?.getBoundingClientRect().width;
      if (parentWidth !== fittedParentWidthRef.current) fitRow();
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    return () => {
      observer.disconnect();
      // Dropped: a remount refits the stored widths to the new width anyway
      clearTimeout(resizeSaveRef.current);
    };
  }, []);

  const notifyReady = useEffectEvent(() => onReady?.({ expandPanel, togglePanel }));
  useEffect(() => {
    notifyReady();
  }, []);

  // E8: a store that loads after mount changes the prop
  const syncFit = useEffectEvent((next: boolean) => {
    if (next === fitRef.current) return;
    fitRef.current = next;
    applyFit();
  });
  useEffect(() => syncFit(fit), [fit]);

  // A reorder re-renders the group but registers nothing
  useEffect(() => updateSeparatorAria());

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      if (!drag.end) return applyLayoutResult(resolveLayout(panelsRef.current, drag, dx), event.clientY);

      const result = resolveEndDrag(panelsRef.current, drag, dx);
      drag.snapped = result.snapped;
      fitLineRef.current?.toggleAttribute('data-snapped', result.snapped);
      applyLayoutResult(result, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) endDrag();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) abortDrag();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
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
      <div ref={containerRef} className={cn('relative flex', className)}>
        {children}
        <div
          ref={fitLineRef}
          hidden
          data-fit-line=""
          className="pointer-events-none absolute inset-y-0 z-999 -translate-x-full border-primary border-r-2 border-dashed data-snapped:border-solid"
        />
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

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    const element = separatorRef.current;
    if (!element || !context) return;
    context.registerSeparator(index, element);
    return () => context.unregisterSeparator(index);
  }, [index, context]);

  const handlePointerDown: PointerEventHandler<HTMLDivElement> = (event) => {
    if (!context || !separatorRef.current || event.button !== 0) return;
    event.preventDefault();
    separatorRef.current.setPointerCapture(event.pointerId);
    separatorRef.current.setAttribute('data-separator', 'drag');
    separatorRef.current.focus();
    context.startDrag(index, event.clientX, event.pointerId);
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
        context.applyKeyboardStep(index, -keyboardStep, true);
        break;
      case 'End':
        event.preventDefault();
        context.applyKeyboardStep(index, keyboardStep, true);
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
