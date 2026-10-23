import { ArrowRightIcon, DatabaseIcon, MonitorIcon, ServerIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useInView } from '~/hooks/use-in-view';
import type { TKey } from '~/lib/i18n-locales';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { cn } from '~/utils/cn';
import { objectEntries } from '~/utils/object-entries';

type SyncMode = 'rest' | 'cdc' | 'yjs' | 'vm';

// Parts in story order: a part's own lines are the ones the part before it lacked.
const modeOrder: SyncMode[] = ['rest', 'cdc', 'yjs', 'vm'];

// Node positions in a 0-100 coordinate space (percentages of the container).
const nodes = {
  database: { x: 50, y: 80, Icon: DatabaseIcon, label: 'Postgres DB' },
  api: { x: 65, y: 20, Icon: ServerIcon, label: 'API server' },
  cdc: { x: 80, y: 80, Icon: ServerIcon, label: 'CDC worker' },
  client: { x: 35, y: 20, Icon: MonitorIcon, label: 'Client' },
  yjs: { x: 20, y: 80, Icon: ServerIcon, label: 'Yjs worker' },
} as const;

type NodeKey = keyof typeof nodes;

interface Edge {
  /** Names a second line between the same two nodes. */
  id?: string;
  from: NodeKey;
  to: NodeKey;
  label?: string;
  labelOffset?: number;
  offset?: number;
  /** Adds a start arrowhead. */
  bidirectional?: boolean;
  /** Defaults to `requestStroke`. */
  stroke?: string;
}

interface StreamEdge extends Edge {
  stroke: string;
  label: string;
}

const requestStroke = '#9ca3af';

// REST request/response flow, drawn as solid grey lines.
const requestEdges: Edge[] = [
  { from: 'cdc', to: 'database', label: 'SQL', offset: -6, labelOffset: -14 },
  { from: 'yjs', to: 'database', label: 'SQL', labelOffset: -14, bidirectional: true },
  { from: 'yjs', to: 'api', label: 'Save', labelOffset: 14 },
];

// Stream connections, drawn dashed.
const streamEdges: StreamEdge[] = [
  { from: 'client', to: 'api', stroke: 'var(--primary)', label: 'HTTP', offset: 10, bidirectional: true },
  { from: 'api', to: 'database', stroke: 'var(--primary)', label: 'SQL', labelOffset: 22, bidirectional: true },
  { from: 'database', to: 'cdc', stroke: '#eab308', label: 'WAL stream', offset: -8, labelOffset: -14 },
  { from: 'cdc', to: 'api', stroke: '#3b82f6', label: 'Changes', labelOffset: 30 },
  { from: 'api', to: 'client', stroke: '#22c55e', label: 'SSE', labelOffset: 14, offset: 4 },
  { from: 'client', to: 'yjs', stroke: '#a855f7', label: 'Changes', labelOffset: 30, bidirectional: true },
  // Part 4: the workers run inside the API server's VM, so their two outside connections end at that VM.
  { id: 'vm-wal', from: 'database', to: 'api', stroke: '#eab308', label: 'WAL stream', offset: 12, labelOffset: 44 },
  { id: 'vm-socket', from: 'client', to: 'api', stroke: '#a855f7', label: 'Changes', offset: 24, labelOffset: 14, bidirectional: true },
];

const edgeKey = (edge: Edge) => edge.id ?? `${edge.from}-${edge.to}`;

const edgeByKey: Record<string, Edge> = Object.fromEntries([...requestEdges, ...streamEdges].map((edge) => [edgeKey(edge), edge]));

// Which nodes and edges participate in each mode. Edge keys are `${from}-${to}`, or the edge's `id`.
const modeConfig: Record<SyncMode, { nodes: NodeKey[]; edges: string[] }> = {
  rest: { nodes: ['database', 'api', 'client'], edges: ['client-api', 'api-database'] },
  cdc: {
    nodes: ['database', 'api', 'cdc', 'client'],
    edges: ['client-api', 'api-database', 'cdc-database', 'database-cdc', 'cdc-api', 'api-client'],
  },
  yjs: {
    nodes: ['database', 'api', 'cdc', 'client', 'yjs'],
    edges: ['client-api', 'api-database', 'cdc-database', 'database-cdc', 'cdc-api', 'api-client', 'client-yjs', 'yjs-database', 'yjs-api'],
  },
  vm: { nodes: ['database', 'api', 'client'], edges: ['client-api', 'api-database', 'api-client', 'vm-wal', 'vm-socket'] },
};

// Per part: the toggle label, and the text shown between the toggle and the diagram, with inline <strong> markup.
const modeText: Record<SyncMode, { label: TKey; text: TKey }> = {
  rest: { label: 'about:sync_diagram.part_1.label', text: 'about:sync_diagram.part_1.text' },
  cdc: { label: 'about:sync_diagram.part_2.label', text: 'about:sync_diagram.part_2.text' },
  yjs: { label: 'about:sync_diagram.part_3.label', text: 'about:sync_diagram.part_3.text' },
  vm: { label: 'about:sync_diagram.part_4.label', text: 'about:sync_diagram.part_4.text' },
};

// Durations in seconds: the REST base fades in and holds, then the part's node fades in and its lines draw in flow order.
const animTimeline = { fade: 0.6, hold: 1, cdcIn: 0.6, draw: 0.9, sqlDraw: 0.6, gap: 0.4 } as const;

// Part 4's durations in seconds: the worker lines pull back, the workers fade, the server widens into one VM, the outside lines draw again.
const foldTimeline = { retract: 0.5, stagger: 0.08, fade: 0.5, morph: 0.6, swap: 0.3 } as const;

// Worker lines in the order they pull back: newest first, the reverse of how Parts 2 and 3 drew them.
const foldOrder = ['yjs-api', 'yjs-database', 'client-yjs', 'cdc-api', 'cdc-database', 'database-cdc'];

// What runs in the one VM, shown inside the widened API server.
const vmWorkers = [
  { key: 'api', label: 'API' },
  { key: 'yjs', label: 'Yjs' },
  { key: 'cdc', label: 'CDC' },
] as const;

type Fold = { nodes: NodeKey[]; edges: string[] };
const noFold: Fold = { nodes: [], edges: [] };

type EdgeTiming = { delay: number; duration: number };

// A line no mode times draws from the start, over the fade time.
const fallbackTiming: EdgeTiming = { delay: 0, duration: animTimeline.fade };

// `lead` is the pause before the mode-specific node appears: the full hold on first reveal, 0 on a toggle.
// `foldAt` is when the last worker line has pulled back in Part 4, which runs on its own clock from the switch.
const buildTimeline = (lead: number, foldAt = 0) => {
  const cdcAt = animTimeline.fade + lead;
  const replicationAt = cdcAt + animTimeline.cdcIn + animTimeline.gap;
  const cdcSqlAt = replicationAt + animTimeline.draw + animTimeline.gap;
  const websocketAt = cdcSqlAt + animTimeline.sqlDraw + animTimeline.gap;
  const sseAt = websocketAt + animTimeline.draw + animTimeline.gap;

  // The Yjs timeline adds the collaboration path to the full CDC flow.
  const yjsAt = sseAt + animTimeline.draw + animTimeline.gap;
  const yjsWebsocketAt = yjsAt + animTimeline.cdcIn + animTimeline.gap;
  const yjsPersistAt = yjsWebsocketAt + animTimeline.draw + animTimeline.gap;
  const yjsSaveAt = yjsPersistAt + animTimeline.sqlDraw + animTimeline.gap;

  // The VM timeline: fold, widen, then draw the two connections to the VM.
  const vmDrawAt = foldAt + foldTimeline.morph + animTimeline.gap;
  const vmAt = { fold: foldAt, workers: foldAt + foldTimeline.swap };

  // A node no mode delays shows from the start.
  const nodeDelay: Record<SyncMode, Partial<Record<NodeKey, number>>> = {
    rest: {},
    cdc: { cdc: cdcAt },
    yjs: { cdc: cdcAt, yjs: yjsAt },
    vm: {},
  };

  const cdcEdgeTiming = {
    'cdc-database': { delay: cdcSqlAt, duration: animTimeline.sqlDraw },
    'database-cdc': { delay: replicationAt, duration: animTimeline.draw },
    'cdc-api': { delay: websocketAt, duration: animTimeline.draw },
    'api-client': { delay: sseAt, duration: animTimeline.draw },
  };

  const edgeTiming: Record<SyncMode, Partial<Record<string, EdgeTiming>>> = {
    rest: {},
    cdc: cdcEdgeTiming,
    yjs: {
      ...cdcEdgeTiming,
      'client-yjs': { delay: yjsWebsocketAt, duration: animTimeline.draw },
      'yjs-database': { delay: yjsPersistAt, duration: animTimeline.sqlDraw },
      'yjs-api': { delay: yjsSaveAt, duration: animTimeline.draw },
    },
    vm: {
      'api-client': { delay: vmDrawAt, duration: animTimeline.draw },
      'vm-wal': { delay: vmDrawAt, duration: animTimeline.draw },
      'vm-socket': { delay: vmDrawAt + animTimeline.gap, duration: animTimeline.draw },
    },
  };

  return { nodeDelay, edgeTiming, vmAt };
};

// Runs of the 0.6 s dash cycle per start: 4.8 s, under the five seconds after which moving content needs a pause control.
const dashRuns = 8;

// Extra room (px) kept between a line end and the icon box edge.
const edgePadding = 8;

type Point = { x: number; y: number };
type Line = { x1: number; y1: number; x2: number; y2: number };
type Geometry = { width: number; height: number; centers: Record<string, Point>; halves: Record<string, { w: number; h: number }> };

/** The unit vector along `(dx, dy)`; `(0, 0)` for a zero-length one. */
const unitVector = (dx: number, dy: number) => {
  const len = Math.hypot(dx, dy) || 1;
  return { ux: dx / len, uy: dy / len };
};

// A bidirectional stream splits into two collinear halves with a center gap, so its dashes flow outward.
const splitLanes = (line: Line) => {
  const { ux, uy } = unitVector(line.x2 - line.x1, line.y2 - line.y1);
  const gap = 3;
  const mx = (line.x1 + line.x2) / 2;
  const my = (line.y1 + line.y2) / 2;
  return [
    { lane: 'fwd', seg: { x1: mx + ux * gap, y1: my + uy * gap, x2: line.x2, y2: line.y2 } },
    { lane: 'rev', seg: { x1: mx - ux * gap, y1: my - uy * gap, x2: line.x1, y2: line.y1 } },
  ];
};

// How far a line ends from a node's center: the circle through a square box's corners, easing to the VM box's edges as the server widens.
const trimOf = (geometry: Geometry, key: NodeKey, ux: number, uy: number) => {
  const { w, h } = geometry.halves[key];
  const stretch = Math.min(1, (w / h - 1) * 2);
  if (stretch <= 0) return Math.hypot(w, h) + edgePadding;
  const side = geometry.halves.database?.w ?? h;
  const round = Math.SQRT2 * side + edgePadding;
  const clearance = round - side;
  const edge = Math.min((w + clearance) / (Math.abs(ux) || 1e-6), (h + clearance) / (Math.abs(uy) || 1e-6));
  return round + (edge - round) * stretch;
};

interface ArrowMarkerProps {
  id: string;
  fill: string;
}

function ArrowMarker({ id, fill }: ArrowMarkerProps) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill={fill} />
    </marker>
  );
}

interface EdgeGroupProps {
  id: string;
  line: Line;
  onHover: (id: string | null) => void;
  children: ReactNode;
}

/** An edge's lines and label, over a wide transparent line that makes the thin one easy to hover. */
function EdgeGroup({ id, line, onHover, children }: EdgeGroupProps) {
  return (
    <g onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)}>
      <line {...line} stroke="transparent" strokeWidth={20} />
      {children}
    </g>
  );
}

interface EdgeLabelProps {
  position: Point;
  fill: string;
  show: boolean;
  delay: number;
  children: string;
}

function EdgeLabel({ position, fill, show, delay, children }: EdgeLabelProps) {
  return (
    <motion.text
      x={position.x}
      y={position.y}
      fill={fill}
      fontSize={11}
      textAnchor="middle"
      dominantBaseline="middle"
      initial={{ opacity: 0 }}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      {children}
    </motion.text>
  );
}

export function SyncDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  // Tracks which lines have finished drawing, so arrowheads/dashes appear only then.
  const [drawn, setDrawn] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<SyncMode>('rest');
  const activeNodes = modeConfig[mode].nodes;
  const activeEdges = modeConfig[mode].edges;
  // Only edges a part introduces get moving dashes; earlier lines stay static. Part 4 is the exception: there every line flows.
  const precedingMode = modeOrder[modeOrder.indexOf(mode) - 1];
  const introducedEdges = new Set(activeEdges.filter((edge) => !precedingMode || !modeConfig[precedingMode].edges.includes(edge)));
  const [lead, setLead] = useState<number>(animTimeline.hold);
  // What the previous part showed and Part 4 folds away: these stay mounted to pull back and fade out.
  const [fold, setFold] = useState<Fold>(noFold);
  const foldAt = fold.edges.length ? (fold.edges.length - 1) * foldTimeline.stagger + foldTimeline.retract : 0;
  const isVm = mode === 'vm';
  // The hovered edge shows its label even where its part did not introduce it.
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(false);
  // Seconds subtracted from delays, so a toggle draws only the new part from t≈0 while the earlier parts stay put.
  const [rebase, setRebase] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const { nodeDelay, edgeTiming, vmAt } = buildTimeline(lead, foldAt);
  const { t } = useTranslation();
  // Finite motion: dashes march under 5 s per start, the hint nudges five times; both rest offscreen and under reduced motion, the hint below sm too.
  const { ref: inViewRef, inView } = useInView();
  const isMobile = useBreakpointBelow('sm');
  const reducedMotion = useReducedMotion();
  const animateHint = inView && !isMobile && !reducedMotion;

  // Keeps everything the previous part showed and animates only the delta.
  const switchMode = (target: SyncMode) => {
    if (target === mode) return;
    setShowHint(false);
    const prev = modeConfig[mode];
    const next = modeConfig[target];
    const newEdges = next.edges.filter((edge) => !prev.edges.includes(edge));
    setLead(0);
    setMode(target);

    // Back from Part 4 nothing replays: the workers and their lines return at once, as any step back does.
    if (mode === 'vm') {
      setFold(noFold);
      setRebase(Number.MAX_SAFE_INTEGER);
      return;
    }

    if (target === 'vm') {
      // Part 4 keeps its own clock, so nothing is rebased: the fold comes first, then the new lines.
      setFold({ nodes: prev.nodes.filter((node) => !next.nodes.includes(node)), edges: foldOrder.filter((edge) => prev.edges.includes(edge)) });
      setRebase(0);
    } else {
      const toggleTimeline = buildTimeline(0);
      const newDelays = [
        ...newEdges.map((edge) => toggleTimeline.edgeTiming[target][edge]?.delay ?? 0),
        ...next.nodes.filter((node) => !prev.nodes.includes(node)).map((node) => toggleTimeline.nodeDelay[target][node] ?? 0),
      ];
      setRebase(newDelays.length ? Math.min(...newDelays) : 0);
    }
    setDrawn((prevDrawn) => {
      const draft = { ...prevDrawn };
      for (const edge of newEdges) delete draft[edge];
      return draft;
    });
  };

  // Effective start delay for an item: instant if already drawn, otherwise rebased to t≈0.
  const startDelay = (delay: number, isDrawn = false) => (isDrawn ? 0 : Math.max(0, delay - rebase));

  // Measure real rendered positions/sizes so line trimming scales at any breakpoint.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const cRect = container.getBoundingClientRect();
      const centers: Record<string, Point> = {};
      const halves: Record<string, { w: number; h: number }> = {};
      for (const key of Object.keys(nodes)) {
        const box = boxRefs.current[key];
        if (!box) continue;
        const bRect = box.getBoundingClientRect();
        centers[key] = { x: bRect.left + bRect.width / 2 - cRect.left, y: bRect.top + bRect.height / 2 - cRect.top };
        halves[key] = { w: bRect.width / 2, h: bRect.height / 2 };
      }
      setGeometry({ width: cRect.width, height: cRect.height, centers, halves });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // The API server's box resizes by itself when it widens into the VM, and its lines follow.
    if (boxRefs.current.api) ro.observe(boxRefs.current.api);
    return () => ro.disconnect();
  }, [mode]);

  // `offset` shifts the whole line perpendicular, to run parallel lines side by side.
  const trimmedLine = (from: NodeKey, to: NodeKey, offset = 0) => {
    if (!geometry) return null;
    const a = geometry.centers[from];
    const b = geometry.centers[to];
    if (!a || !b) return null;
    const { ux, uy } = unitVector(b.x - a.x, b.y - a.y);
    const px = -uy * offset;
    const py = ux * offset;
    const fromTrim = trimOf(geometry, from, ux, uy);
    const toTrim = trimOf(geometry, to, ux, uy);
    return {
      x1: a.x + ux * fromTrim + px,
      y1: a.y + uy * fromTrim + py,
      x2: b.x - ux * toTrim + px,
      y2: b.y - uy * toTrim + py,
    };
  };

  // `offset` moves the label off the line's midpoint, perpendicular to it.
  const labelPos = (line: Line, offset = 12) => {
    const { ux, uy } = unitVector(line.x2 - line.x1, line.y2 - line.y1);
    return { x: (line.x1 + line.x2) / 2 - uy * offset, y: (line.y1 + line.y2) / 2 + ux * offset };
  };

  return (
    <div ref={inViewRef} className="mx-auto mb-8 flex w-full max-w-3xl flex-col items-center">
      <div className="relative mb-6">
        {showHint && (
          <div className="absolute top-1/2 right-full mr-3 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-muted-foreground max-sm:hidden">
            {t('about:try_me')}
            <motion.span
              animate={{ x: animateHint ? [0, 4, 0] : 0 }}
              transition={animateHint ? { repeat: 4, ease: 'easeInOut', duration: 1 } : { duration: 0 }}
            >
              <ArrowRightIcon />
            </motion.span>
          </div>
        )}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            const target = modeOrder.find((syncMode) => syncMode === value);
            if (target) switchMode(target);
          }}
          variant="merged"
        >
          {modeOrder.map((syncMode) => (
            <ToggleGroupItem key={syncMode} value={syncMode}>
              {t(modeText[syncMode].label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="mx-auto mb-4 max-w-2xl font-light text-muted-foreground text-sm sm:text-center"
        >
          <Trans t={t} i18nKey={modeText[mode].text as never} components={{ strong: <strong className="font-normal text-foreground" /> }} />
        </motion.p>
      </AnimatePresence>

      {/* biome-ignore lint/a11y/useSemanticElements: decorative diagram acts as a click-to-reveal toggle; a real <button> can't wrap the SVG + absolutely-positioned nodes */}
      <div
        ref={containerRef}
        onClick={() => setShowAllLabels((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowAllLabels((prev) => !prev);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={showAllLabels}
        aria-label={t('about:sync_diagram.toggle_labels')}
        className="relative aspect-4/3 w-full cursor-pointer sm:aspect-video md:aspect-5/2"
      >
        {/* SVG overlay drawn in real pixel space and re-measured on resize. */}
        {geometry && (
          <svg className="absolute inset-0 size-full" viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
            <defs>
              <ArrowMarker id="request-arrow" fill={requestStroke} />
              {streamEdges.map((edge) => (
                <ArrowMarker key={edgeKey(edge)} id={`stream-arrow-${edgeKey(edge)}`} fill={edge.stroke} />
              ))}
            </defs>

            {/* Part 4: each worker line pulls back into the node that stays, the reverse of how it was drawn. */}
            {fold.edges.map((key, index) => {
              const edge = edgeByKey[key];
              if (!edge) return null;
              const line = fold.nodes.includes(edge.from)
                ? trimmedLine(edge.to, edge.from, -(edge.offset ?? 0))
                : trimmedLine(edge.from, edge.to, edge.offset);
              if (!line) return null;
              const delay = index * foldTimeline.stagger;
              return (
                <motion.line
                  key={`${key}-retract`}
                  {...line}
                  stroke={edge.stroke ?? requestStroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ pathLength: 1, opacity: 1 }}
                  animate={{ pathLength: 0, opacity: 0 }}
                  transition={{
                    pathLength: { delay, duration: foldTimeline.retract, ease: 'easeInOut' },
                    opacity: { delay: delay + foldTimeline.retract, duration: 0.001 },
                  }}
                />
              );
            })}

            {requestEdges.map(({ from, to, label, offset, labelOffset, bidirectional }) => {
              const key = `${from}-${to}`;
              if (!activeEdges.includes(key)) return null;
              const line = trimmedLine(from, to, offset);
              if (!line) return null;
              const timing = edgeTiming[mode][key] ?? fallbackTiming;
              const delay = startDelay(timing.delay, drawn[key]);
              const arrow = drawn[key] ? 'url(#request-arrow)' : undefined;
              const isIntroduced = introducedEdges.has(key);
              return (
                <EdgeGroup key={key} id={key} line={line} onHover={setHovered}>
                  <motion.line
                    {...line}
                    stroke={requestStroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    markerStart={bidirectional ? arrow : undefined}
                    markerEnd={arrow}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ pathLength: { delay, duration: timing.duration, ease: 'easeInOut' }, opacity: { delay, duration: 0.001 } }}
                    onAnimationComplete={() => setDrawn((prevDrawn) => ({ ...prevDrawn, [key]: true }))}
                  />
                  {label && (
                    <EdgeLabel
                      position={labelPos(line, labelOffset)}
                      fill={requestStroke}
                      show={isIntroduced || hovered === key || showAllLabels}
                      delay={isIntroduced ? delay + timing.duration : 0}
                    >
                      {label}
                    </EdgeLabel>
                  )}
                </EdgeGroup>
              );
            })}

            {streamEdges.map(({ id, from, to, stroke, label, labelOffset, offset, bidirectional }) => {
              const key = edgeKey({ id, from, to });
              if (!activeEdges.includes(key)) return null;
              const line = trimmedLine(from, to, offset);
              if (!line) return null;
              const timing = edgeTiming[mode][key] ?? fallbackTiming;
              // In Part 4 the socket line runs where the HTTP label sits, so that label moves below it: right under on hover, a row lower when all labels show.
              const underSocket = isVm && key === 'client-api';
              const delay = startDelay(timing.delay, drawn[key]);
              const isIntroduced = introducedEdges.has(key);
              // Part 4 is the whole picture, so all its lines flow, starting together once its last line is drawn.
              const flows = isVm ? Boolean(drawn['vm-wal'] && drawn['vm-socket']) : isIntroduced;
              const animateDashes = flows && inView && !reducedMotion;
              // Part 4 names none of its lines by itself, so no line stands out; hover and the label toggle still reveal each name.
              const labelsItself = isIntroduced && !isVm;
              const lanes = bidirectional ? splitLanes(line) : [{ lane: 'flow', seg: line }];
              return (
                <EdgeGroup key={key} id={key} line={line} onHover={setHovered}>
                  {drawn[key] ? (
                    lanes.map(({ lane, seg }) => (
                      <motion.line
                        key={`${key}-${lane}`}
                        {...seg}
                        stroke={stroke}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray="5 5"
                        markerEnd={`url(#stream-arrow-${key})`}
                        animate={{ strokeDashoffset: animateDashes ? [0, -10] : 0 }}
                        transition={animateDashes ? { repeat: dashRuns - 1, ease: 'linear', duration: 0.6 } : { duration: 0 }}
                      />
                    ))
                  ) : (
                    <motion.line
                      key={`${key}-draw`}
                      {...line}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ pathLength: { delay, duration: timing.duration, ease: 'easeInOut' }, opacity: { delay, duration: 0.001 } }}
                      onAnimationComplete={() => setDrawn((prevDrawn) => ({ ...prevDrawn, [key]: true }))}
                    />
                  )}
                  <EdgeLabel
                    position={labelPos(line, underSocket ? (showAllLabels ? 40 : 28) : labelOffset)}
                    fill={stroke}
                    show={labelsItself || hovered === key || showAllLabels}
                    delay={labelsItself ? delay + timing.duration : 0}
                  >
                    {label}
                  </EdgeLabel>
                </EdgeGroup>
              );
            })}
          </svg>
        )}

        {objectEntries(nodes).map(([key, { x, y, Icon, label }]) => {
          // A worker Part 4 folds away stays mounted to fade out where it stands.
          const folding = fold.nodes.includes(key);
          if (!activeNodes.includes(key) && !folding) return null;
          const isLastNode = (mode === 'cdc' && key === 'cdc') || (mode === 'yjs' && key === 'yjs');
          const becomesVm = key === 'api' && isVm;
          return (
            <motion.div
              key={key}
              aria-hidden={folding || undefined}
              className={cn('absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2', y < 50 ? 'flex-col-reverse' : 'flex-col')}
              style={{ left: `${x}%`, top: `${y}%` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: folding ? 0 : 1 }}
              transition={
                folding
                  ? { delay: vmAt.fold, duration: foldTimeline.fade }
                  : { delay: startDelay(nodeDelay[mode][key] ?? 0), duration: isLastNode ? animTimeline.cdcIn : animTimeline.fade }
              }
            >
              {key === 'api' ? (
                <div className="relative size-11 sm:size-14 md:size-16">
                  {/* Widens to the right from the server's own box, so the lines on the client side stay where they are. */}
                  <div
                    ref={(el) => {
                      boxRefs.current[key] = el;
                    }}
                    className={cn(
                      'absolute top-1/2 left-0 -translate-y-1/2 rounded-xl border bg-background shadow-sm transition-[width,height,border-color] ease-in-out motion-reduce:transition-none',
                      isVm ? 'h-14 w-28 border-foreground/40 sm:h-18 sm:w-36 md:h-20 md:w-42' : 'size-11 sm:size-14 md:size-16',
                    )}
                    style={{ transitionDuration: `${foldTimeline.morph}s`, transitionDelay: `${isVm ? vmAt.fold : 0}s` }}
                  >
                    <motion.div
                      initial={false}
                      animate={{ opacity: isVm ? 0 : 1 }}
                      transition={{ delay: isVm ? vmAt.fold : foldTimeline.swap, duration: foldTimeline.swap }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Icon className="size-5 sm:size-7 md:size-8" />
                    </motion.div>
                    <div
                      aria-hidden={!isVm}
                      className="absolute inset-0 flex items-center justify-center gap-2 overflow-hidden rounded-xl sm:gap-2.5 md:gap-3"
                    >
                      {vmWorkers.map((worker) => (
                        <motion.div
                          key={worker.key}
                          initial={false}
                          animate={{ opacity: isVm ? 1 : 0 }}
                          transition={isVm ? { delay: vmAt.workers, duration: foldTimeline.fade } : { duration: 0.2 }}
                          className="flex flex-col items-center gap-1"
                        >
                          <div className="flex size-6 items-center justify-center rounded-md border sm:size-7 md:size-8">
                            <ServerIcon className="size-3.5 sm:size-4" />
                          </div>
                          <span className="text-2xs text-muted-foreground leading-none">{worker.label}</span>
                        </motion.div>
                      ))}
                    </div>
                    <motion.span
                      aria-hidden={!isVm}
                      initial={false}
                      animate={{ opacity: isVm ? 1 : 0 }}
                      transition={isVm ? { delay: vmAt.workers, duration: foldTimeline.swap } : { duration: 0.2 }}
                      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap font-medium text-xs"
                    >
                      {t('about:sync_diagram.one_vm')}
                    </motion.span>
                  </div>
                </div>
              ) : (
                <div
                  ref={(el) => {
                    boxRefs.current[key] = el;
                  }}
                  className="flex size-11 items-center justify-center rounded-xl border bg-background shadow-sm sm:size-14 md:size-16"
                >
                  <Icon className="size-5 sm:size-7 md:size-8" />
                </div>
              )}
              <span
                className={cn('truncate text-muted-foreground text-xs transition-opacity', becomesVm && 'opacity-0')}
                style={{ transitionDuration: `${foldTimeline.swap}s`, transitionDelay: `${becomesVm ? vmAt.fold : 0}s` }}
              >
                {label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
