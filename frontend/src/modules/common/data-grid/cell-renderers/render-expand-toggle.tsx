import { ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

export interface RenderExpandToggleProps {
  expanded: boolean;
  hasChildren: boolean;
  /** Pixel height of the row; connector paths are drawn in row-relative pixel coordinates. */
  rowHeight: number;
  /** Nesting depth of the row. 0 = root. Draws a connector line above nested rows. */
  depth?: number;
  /** True when this row is the last child of its parent. Suppresses the connector line below. */
  isLastChild?: boolean;
  /** True when the parent is the last child of its grandparent; decides if the depth-1 trunk continues through deeper rows. */
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
const CX = COL / 2;
/** Horizontal offset of the depth-1 ("solid") and depth-2 ("thin") tracks from center. */
const TRACK_OFFSET = 4;
const SOLID_X = CX - TRACK_OFFSET;
const THIN_X = CX + TRACK_OFFSET;
const STROKE_SOLID = 2;
const STROKE_THIN = 1;
/** Half-height of the size-5 (20px) chevron button; elbows stop this far from row center so the chevron cannot clip the curve. */
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
  const midY = (yStem + yEnd) / 2;
  return `M ${xStart} 0 V ${yStem} C ${xStart} ${midY}, ${xEnd} ${midY}, ${xEnd} ${yEnd}`;
}

/** Mirror of {@link elbowAbovePath} for the bottom half. */
function elbowBelowPath(xStart: number, xEnd: number, rowHeight: number): string {
  const yStart = rowHeight / 2 + CHEVRON_HALF;
  const yStem = (yStart + rowHeight) / 2; // curve occupies upper half of remaining lower-half-row
  const midY = (yStem + yStart) / 2;
  return `M ${xStart} ${yStart} C ${xStart} ${midY}, ${xEnd} ${midY}, ${xEnd} ${yStem} V ${rowHeight}`;
}

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

  // Lower-half solid trunk on an expanded parent with children on the thin track, keeping the depth-1 line continuous to the next sibling.
  if (g.solidTrunkBelow) {
    paths.push({ d: elbowBelowPath(CX, SOLID_X, H), thin: false });
  }

  return paths;
}

/** Root rows show only a chevron; deeper rows add solid or thin connector tracks and leaf bullets. */
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
  // A line below joins the first child of an expanded parent, or the next sibling of a nested row.
  const showLineBelow = (hasChildren && expanded) || (depth > 0 && !isLastChild);

  const isDeepest = maxDepth !== undefined && depth >= maxDepth - 1;
  const childIsDeepest = maxDepth !== undefined && depth + 1 >= maxDepth - 1;
  // Thinness matches whatever the below-line joins: children when expanded, otherwise the next sibling.
  const lineBelowIsThin = hasChildren && expanded ? childIsDeepest : isDeepest;
  const lineAboveIsThin = isDeepest;
  // Keeps the depth-1 trunk continuous through deepest rows while its ancestor still has siblings to come.
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
        // Connectors stretch to the rendered cell for mobile row and rem scaling; the viewBox keeps desktop drawing coordinates.
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
        // Deepest leaf bullets ride the thin track (4px right of center), inner-leaf bullets the solid track (4px left).
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
