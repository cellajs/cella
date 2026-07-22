import { ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

export interface RenderExpandToggleProps {
  expanded: boolean;
  hasChildren: boolean;
  /** Pixel height of the row the toggle is rendered in. Required so the SVG connector paths can be drawn in row-relative pixel coordinates. */
  rowHeight: number;
  /** Nesting depth of the row. 0 = root. Draws a connector line above nested rows. */
  depth?: number;
  /** True when this row is the last child of its parent. Suppresses the connector line below. */
  isLastChild?: boolean;
  /** True when this row's parent is itself the last child of its grandparent. Determines
   *  whether the depth-1 trunk should keep going through deeper rows. */
  parentIsLastChild?: boolean;
  /** Maximum nesting depth; its final level receives the thin, hollow depth-limit treatment. */
  maxDepth?: number;
  tabIndex?: number;
  /** Optional accessible label for the toggle. Falls back to "Expand"/"Collapse". */
  label?: string;
  onToggle: () => void;
}

// Connector geometry. All values are in SVG user units == cell pixels (the SVG has no scaling).

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
 * terminate at this distance from row center, so
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

/** Draw a vertical-tangent elbow from the previous row's track to the chevron's unclipped top edge. */
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
 * per element. Snapshot the array for each visual case.
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
  // thin track; keeps the depth-1 line continuous to the next sibling at
  // this depth, and balances the thin elbow on the right.
  if (g.solidTrunkBelow) {
    paths.push({ d: elbowBelowPath(CX, SOLID_X, H), thin: false });
  }

  return paths;
}

/**
 * Renders the focusable tree-grid toggle and its depth-aware connectors.
 * Root rows show only a chevron; deeper rows use solid or thin tracks and leaf bullets.
 * Curved SVG paths keep connectors continuous through the toggle.
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

  // Derived here (not by consumers) so callers pass only the tree shape, not visual flags.
  const isDeepest = maxDepth !== undefined && depth >= maxDepth - 1;
  const childIsDeepest = maxDepth !== undefined && depth + 1 >= maxDepth - 1;
  // Below-line joins either children (when expanded) or the next sibling.
  // Match thinness to whichever it joins.
  const lineBelowIsThin = hasChildren && expanded ? childIsDeepest : isDeepest;
  const lineAboveIsThin = isDeepest;
  // Keep the depth-1 trunk continuous through deepest rows when the depth-1
  // ancestor still has more siblings to come.
  const parentTrunkContinues = isDeepest && !parentIsLastChild;
  // Keeps the centered trunk continuous to the next sibling when children sit on the thin track.
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
        // Stretch connectors to the rendered cell so mobile row and rem scaling remain aligned.
        // The viewBox retains stable desktop drawing coordinates.
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
          <ChevronRightIcon className={`opacity-70 transition-transform ${expanded ? 'rotate-90' : ''}`} />
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
