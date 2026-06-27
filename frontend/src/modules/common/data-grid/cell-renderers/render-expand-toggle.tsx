import { ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

export interface RenderExpandToggleProps {
  expanded: boolean;
  hasChildren: boolean;
  /** Pixel height of the row the toggle is rendered in. Required so the SVG connector paths can be drawn in row-relative pixel coordinates. */
  rowHeight: number;
  /** Nesting depth of the row. 0 = root. Used to draw a connector line above nested rows. */
  depth?: number;
  /** True when this row is the last child of its parent. Suppresses the connector line below. */
  isLastChild?: boolean;
  /** True when this row's parent is itself the last child of its grandparent. Used to know
   *  whether the depth-1 trunk should keep going through deeper rows. */
  parentIsLastChild?: boolean;
  /**
   * Maximum allowed nesting depth (inclusive). When set, rows at `maxDepth - 1`
   * switch to a "deepest" visual (thin connector lines, hollow bullet,
   * offset onto a deeper track) so users can see the depth limit at a glance.
   * Omit for unlimited / undecorated nesting.
   */
  maxDepth?: number;
  tabIndex?: number;
  /** Optional accessible label for the toggle. Falls back to "Expand"/"Collapse". */
  label?: string;
  onToggle: () => void;
}

// ─── Connector geometry ──────────────────────────────────────────────────────
// All values are in SVG user units == cell pixels (the SVG has no scaling).

/** Column width in px. Must match the column factory's `width`. */
const COL = 36;
/** Column horizontal center. */
const CX = COL / 2;
/** Horizontal offset of the depth-1 ("solid") and depth-2 ("thin") tracks from center. */
const TRACK_OFFSET = 4;
const SOLID_X = CX - TRACK_OFFSET;
const THIN_X = CX + TRACK_OFFSET;
const STROKE_SOLID = 2;
const STROKE_THIN = 1;
/**
 * Half-height of the chevron button (size-5 = 20px tall, so 10px). Elbows
 * terminate at this distance from row center instead of at row center, so
 * the curve isn't clipped by the chevron sitting on top of it.
 */
const CHEVRON_HALF = 10;

interface ConnectorPath {
  d: string;
  thin: boolean;
}

interface ConnectorGeometry {
  showLineAbove: boolean;
  showLineBelow: boolean;
  hasChildren: boolean;
  lineAboveIsThin: boolean;
  lineBelowIsThin: boolean;
  parentTrunkContinues: boolean;
  solidTrunkBelow: boolean;
  rowHeight: number;
}

/**
 * Smooth elbow above the chevron — straight stem on the offset track, then a
 * cubic-Bézier S-curve that lands on the chevron's top edge (not its center).
 * Terminating at the chevron edge means the entire curve stays visible above
 * the button rather than being clipped behind it. Tangents are vertical at
 * both ends so the path connects seamlessly to the previous row's vertical
 * line and aligns with the chevron's vertical centerline.
 */
function elbowAbovePath(xStart: number, xEnd: number, rowHeight: number): string {
  const yEnd = rowHeight / 2 - CHEVRON_HALF;
  const yStem = yEnd / 2; // stem from top to half-way to the chevron edge
  const midY = (yStem + yEnd) / 2; // both control points sit at the curve's vertical midpoint
  return `M ${xStart} 0 V ${yStem} C ${xStart} ${midY}, ${xEnd} ${midY}, ${xEnd} ${yEnd}`;
}

/** Mirror of {@link elbowAbovePath} for the bottom half. */
function elbowBelowPath(xStart: number, xEnd: number, rowHeight: number): string {
  const yStart = rowHeight / 2 + CHEVRON_HALF;
  const yStem = (yStart + rowHeight) / 2; // curve occupies upper half of remaining lower-half-row
  const midY = (yStem + yStart) / 2;
  return `M ${xStart} ${yStart} C ${xStart} ${midY}, ${xEnd} ${midY}, ${xEnd} ${yStem} V ${rowHeight}`;
}

/**
 * Pure helper: returns all connector path segments for a row. One SVG path
 * per element. Trivially testable — snapshot the array for each visual case.
 */
function buildConnectorPaths(g: ConnectorGeometry): ConnectorPath[] {
  const paths: ConnectorPath[] = [];
  const H = g.rowHeight;
  const yMid = H / 2;

  // Continuous depth-1 trunk through deeper rows so depth-1 siblings stay connected.
  if (g.parentTrunkContinues) {
    paths.push({ d: `M ${SOLID_X} 0 V ${H}`, thin: false });
  }

  if (g.showLineAbove) {
    if (g.hasChildren) {
      const xStart = g.lineAboveIsThin ? THIN_X : SOLID_X;
      paths.push({ d: elbowAbovePath(xStart, CX, H), thin: g.lineAboveIsThin });
    } else {
      const x = g.lineAboveIsThin ? THIN_X : SOLID_X;
      paths.push({ d: `M ${x} 0 V ${yMid}`, thin: g.lineAboveIsThin });
    }
  }

  if (g.showLineBelow) {
    if (g.hasChildren) {
      const xEnd = g.lineBelowIsThin ? THIN_X : SOLID_X;
      paths.push({ d: elbowBelowPath(CX, xEnd, H), thin: g.lineBelowIsThin });
    } else {
      const x = g.lineBelowIsThin ? THIN_X : SOLID_X;
      paths.push({ d: `M ${x} ${yMid} V ${H}`, thin: g.lineBelowIsThin });
    }
  }

  // Lower-half solid trunk on an expanded parent whose children are on the
  // thin track — keeps the depth-1 line continuous to the next sibling at
  // this depth, and balances the thin elbow on the right.
  if (g.solidTrunkBelow) {
    paths.push({ d: elbowBelowPath(CX, SOLID_X, H), thin: false });
  }

  return paths;
}

/**
 * Reusable, focusable expand/collapse toggle for tree-style data grids.
 *
 * Visual language (calibrated for a tree with 2 or 3 levels — the consumer
 * sets the limit via `maxDepth`):
 * - Root rows (`depth = 0`): chevron only, no connector lines.
 * - Inner rows: 2px solid connector lines + filled bullet for leaves, all on
 *   the centered "depth-1" track (column center − 4px).
 * - Deepest rows (`depth = maxDepth - 1`): 1px thin connector lines + hollow
 *   bullet on a "depth-2" track (column center + 4px). When the depth-1
 *   ancestor still has siblings to come, a continuous solid trunk is also
 *   drawn at the depth-1 track so depth-1 siblings stay visually connected.
 *
 * Connector lines are rendered as SVG paths with cubic-Bézier corners so
 * elbows flow smoothly through the chevron without a visible "hinge".
 */
export function RenderExpandToggle({
  expanded,
  hasChildren,
  rowHeight,
  depth = 0,
  isLastChild = false,
  parentIsLastChild = false,
  maxDepth,
  tabIndex,
  label,
  onToggle,
}: RenderExpandToggleProps) {
  const { t } = useTranslation();

  const showLineAbove = depth > 0;
  // Line below: either this is an expanded parent (joining its first child)
  // or this is a nested row that has more siblings after it (joining the next sibling).
  const showLineBelow = (hasChildren && expanded) || (depth > 0 && !isLastChild);

  // Visual flags derived from the depth limit. Kept here so consumers only
  // need to pass the underlying tree shape — they don't have to memorise the
  // visual language.
  const isDeepest = maxDepth !== undefined && depth >= maxDepth - 1;
  const childIsDeepest = maxDepth !== undefined && depth + 1 >= maxDepth - 1;
  // Below-line joins either children (when expanded) or the next sibling.
  // Match thinness to whichever it joins.
  const lineBelowIsThin = hasChildren && expanded ? childIsDeepest : isDeepest;
  const lineAboveIsThin = isDeepest;
  // Keep the depth-1 trunk continuous through deepest rows when the depth-1
  // ancestor still has more siblings to come.
  const parentTrunkContinues = isDeepest && !parentIsLastChild;
  // Lower-half centered trunk on an expanded parent whose children sit on the
  // deeper (thin) track — keeps the centered trunk continuous to the next
  // sibling at this depth.
  const solidTrunkBelow = hasChildren && expanded && !isLastChild && childIsDeepest;

  const paths = buildConnectorPaths({
    showLineAbove,
    showLineBelow,
    hasChildren,
    lineAboveIsThin,
    lineBelowIsThin,
    parentTrunkContinues,
    solidTrunkBelow,
    rowHeight,
  });

  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {paths.length > 0 && (
        // No fixed width/height: `preserveAspectRatio="none"` lets the SVG stretch to fill the
        // actual rendered cell (via `inset-0` + `h-full w-full`). On mobile the grid renders rows
        // ~1.2x taller and the rem-scaled UI grows the column, so the connector follows along
        // instead of staying locked to the desktop px size. The viewBox stays in desktop user-units.
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full text-input"
          viewBox={`0 0 ${COL} ${rowHeight}`}
          preserveAspectRatio="none"
        >
          {paths.map((p, i) => (
            <path
              // biome-ignore lint/suspicious/noArrayIndexKey: paths array is rebuilt for each row; index is stable per render.
              key={i}
              d={p.d}
              stroke="currentColor"
              strokeWidth={p.thin ? STROKE_THIN : STROKE_SOLID}
              fill="none"
            />
          ))}
        </svg>
      )}
      {hasChildren ? (
        <Button
          variant="secondary"
          size="xs"
          data-slot="expand-toggle"
          tabIndex={tabIndex}
          aria-expanded={expanded}
          aria-label={label ?? (expanded ? t('c:collapse') : t('c:expand'))}
          draggable={false}
          className="relative size-5 rounded p-0"
          onMouseDown={(e) => {
            // Prevent the cell's mousedown from also toggling row selection.
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }
          }}
        >
          <ChevronRightIcon size={16} className={`opacity-70 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </Button>
      ) : depth > 0 ? (
        // Deepest leaf bullets ride the thin track (4px right of center) so
        // they line up with the thin lines above/below them. Inner-leaf
        // bullets ride the solid track (4px left of center).
        isDeepest ? (
          <span
            aria-hidden
            className="absolute top-1/2 left-[calc(50%+4px)] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-input bg-background"
          />
        ) : (
          <span
            aria-hidden
            className="absolute top-1/2 left-[calc(50%-4px)] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-input"
          />
        )
      ) : null}
    </span>
  );
}
