// Pure width logic: no DOM, so every rule here runs in a plain unit test. Rules & examples → resizable-panels.md

export interface PanelConfig {
  id: string;
  minWidth: number;
  collapsedWidth: number;
  collapsible: boolean;
}

export interface HintData {
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

export interface LayoutResult {
  widths: Record<string, number>;
  hints: HintData[];
}

export interface DragState {
  separatorIndex: number;
  startX: number;
  /** The mode (G6), fixed at drag start; false is overflow */
  autoFill: boolean;
  initialWidths: Record<string, number>;
  collapsedAtStart: Set<string>;
  /** The drag may swap a closed panel open (F7), and never ends over budget */
  mustFit?: boolean;
  /** Set when the end handle is dragged (E rules) */
  end?: EndDragState;
}

export interface EndDragState {
  /** Fit at drag start */
  fit: boolean;
  /** What the panels may take for the row to fit: the parent's width less the separators */
  room: number;
  /** Curtain width at the end of the gate (E5) */
  reach: number;
}

export interface FitInput {
  panels: PanelConfig[];
  /** The user's widths: at or below `collapsedWidth` is a panel they closed, and anything unusable counts as `minWidth` */
  chosen: Record<string, number>;
  /** Panels an earlier fit closed, oldest first */
  autoCollapsed: string[];
  /** What the panels may take: the parent's width less the separators */
  available: number;
  /** Panel ids, least recently touched first */
  recency?: string[];
  /** Panels that stay open while any other can close */
  keep?: string[];
}

// F4: without this margin a classic scrollbar appearing could close a panel, shorten the page, remove the scrollbar and reopen it
const restoreMargin = 24;

// G2: past this width a shrinking victim collapses; before it, it holds minWidth
const collapseSnapPoint = (panel: PanelConfig) => (panel.collapsedWidth + panel.minWidth) / 2.2;

function collapseProgress(panel: PanelConfig, rawWidth: number): number {
  const snapPoint = collapseSnapPoint(panel);
  if (rawWidth >= panel.minWidth || rawWidth <= snapPoint) return 0;
  return (panel.minWidth - rawWidth) / (panel.minWidth - snapPoint);
}

/** Shares `available` by `weights`: whoever a share would take below `minWidth` holds it, and the others share the rest exactly. */
export function distributeWidths(panels: PanelConfig[], weights: Record<string, number>, available: number): Record<string, number> {
  const widths: Record<string, number> = {};
  const totalWeight = (group: PanelConfig[]) => group.reduce((sum, panel) => sum + weights[panel.id], 0);

  let rest = panels;
  let free = available;
  while (rest.length) {
    const total = totalWeight(rest);
    const share = free;
    const pinned = rest.filter((panel) => (share * weights[panel.id]) / total < panel.minWidth);
    if (!pinned.length) break;
    for (const panel of pinned) {
      widths[panel.id] = panel.minWidth;
      free -= panel.minWidth;
    }
    rest = rest.filter((panel) => !pinned.includes(panel));
  }

  const total = totalWeight(rest);
  let given = 0;
  rest.forEach((panel, index) => {
    // Unrounded: a row refits on every pixel of a resize, and rounding down each time would hand the last panel a pixel per refit
    widths[panel.id] = index === rest.length - 1 ? free - given : (free * weights[panel.id]) / total;
    given += widths[panel.id];
  });
  return widths;
}

/** Idempotent and DOM-free: dragging backward re-evaluates from initialWidths and reverses. */
export function resolveLayout(panels: PanelConfig[], drag: DragState, dx: number): LayoutResult {
  const { separatorIndex, initialWidths, collapsedAtStart, autoFill, mustFit } = drag;
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
  } else for (let i = separatorIndex + 1; i < panels.length; i++) victimIndices.push(i);

  let remaining = absDx;
  // Overflow mode funds the expand from trailing gap (O2); autoFill makes victims fund it.
  if (expandCost > 0 && !autoFill) remaining -= expandCost;

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
      if (collapsedAtStart.has(victim.id) || !victim.collapsible) continue;

      // G10: overflow gets a free expand from trailing gap, so the block is autoFill only
      if (autoFill && !mustFit && isExpandingFromCollapsed && victimIndex === directVictimIndex && totalFreed < expandCost) continue;

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

    // F7: not funded yet, so the gate holds
    if (mustFit && isExpandingFromCollapsed && totalFreed + collapseFreed < expandCost) {
      hints.push({ panelId: grower.id, side: draggingLeft ? 'left' : 'right', mode: 'expand', progress: 1, reach: 0 });
      const neighbour = panels[draggingLeft ? separatorIndex : separatorIndex + 1];
      if (neighbour && !hints.some((hint) => hint.panelId === neighbour.id)) {
        hints.push({ panelId: neighbour.id, side: draggingLeft ? 'right' : 'left', mode: 'cover', progress: 1, reach: expandCost });
      }
      return { widths: { ...initialWidths }, hints };
    }
  }

  return { widths, hints };
}

// E5: how far a drag right pulls before its release turns fit off
const endGate = 40;

/** The end handle's drag: without fit, a drag left narrows the row toward its fit (E3); with fit, a drag right pulls through a gate (E5). `snapped` is whether a release switches fit. */
export function resolveEndDrag(panels: PanelConfig[], drag: DragState, dx: number): LayoutResult & { snapped: boolean } {
  const { initialWidths, collapsedAtStart, end } = drag;
  const widths = { ...initialWidths };
  const last = panels.at(-1);
  // E7: the other direction does nothing
  if (!end || !last || (end.fit ? dx <= 0 : dx >= 0)) return { widths, hints: [], snapped: false };

  if (end.fit) {
    const progress = Math.min(dx / endGate, 1);
    return { widths, hints: [{ panelId: last.id, side: 'right', mode: 'cover', progress, reach: end.reach }], snapped: progress === 1 };
  }

  let remaining = -dx;
  for (const panel of [...panels].reverse()) {
    if (remaining <= 0) break;
    if (collapsedAtStart.has(panel.id)) continue;
    const initialWidth = initialWidths[panel.id] ?? panel.minWidth;
    const shrink = Math.min(remaining, Math.max(0, initialWidth - panel.minWidth));
    widths[panel.id] = initialWidth - shrink;
    remaining -= shrink;
  }
  const total = panels.reduce((sum, panel) => sum + (widths[panel.id] ?? panel.minWidth), 0);
  return { widths, hints: [], snapped: total <= end.room || remaining > 0 };
}

/** Must-fit layout from what the user chose: closes panels until the row fits, reopens them when room returns, and shares the rest exactly. Valid for any stored value. */
export function fitPanels({ panels, chosen, autoCollapsed, available, recency = [], keep = [] }: FitInput) {
  const chosenWidth = (panel: PanelConfig) => {
    const width = chosen[panel.id];
    return Number.isFinite(width) && width > 0 ? width : panel.minWidth;
  };
  const isUserCollapsed = (panel: PanelConfig) => panel.collapsible && chosenWidth(panel) <= panel.collapsedWidth;

  const known = autoCollapsed.filter((id) => panels.some((panel) => panel.id === id && !isUserCollapsed(panel)));
  const closed = [...known];
  const open = new Set(panels.filter((panel) => !isUserCollapsed(panel) && !closed.includes(panel.id)).map((panel) => panel.id));

  const cost = (ids: Set<string>) => panels.reduce((sum, panel) => sum + (ids.has(panel.id) ? panel.minWidth : panel.collapsedWidth), 0);
  const rank = (id: string) => (keep.includes(id) ? panels.length + recency.length : 0) + recency.indexOf(id);

  while (cost(open) > available && open.size > 1) {
    const candidates = panels.filter((panel) => panel.collapsible && open.has(panel.id));
    if (!candidates.length) break;
    // Equal ranks close the rightmost first
    const victim = candidates.reduce((best, panel) => (rank(panel.id) <= rank(best.id) ? panel : best));
    open.delete(victim.id);
    closed.push(victim.id);
  }

  if (closed.length === known.length) {
    for (let i = closed.length - 1; i >= 0; i--) {
      if (cost(new Set(open).add(closed[i])) + restoreMargin > available) break;
      open.add(closed[i]);
      closed.splice(i, 1);
    }
  }

  const openPanels = panels.filter((panel) => open.has(panel.id));
  const closedPanels = panels.filter((panel) => !open.has(panel.id));
  const free = available - closedPanels.reduce((sum, panel) => sum + panel.collapsedWidth, 0);
  const weights = Object.fromEntries(openPanels.map((panel) => [panel.id, Math.max(chosenWidth(panel), panel.minWidth)]));

  const widths = distributeWidths(openPanels, weights, free);
  for (const panel of closedPanels) widths[panel.id] = panel.collapsedWidth;
  return { widths, autoCollapsed: closed };
}
