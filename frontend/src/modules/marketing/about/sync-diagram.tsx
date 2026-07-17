import { ArrowRightIcon, DatabaseIcon, MonitorIcon, ServerIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

// The diagram can be viewed in three sync modes, toggled by the user.
type SyncMode = 'rest' | 'cdc' | 'yjs';

// Node positions in a 0–100 coordinate space (percentages of the container).
// Keeping them here makes it easy to nudge layout and later anchor connector lines.
const nodes = {
  database: { x: 50, y: 80, Icon: DatabaseIcon, label: 'Postgres DB' },
  api: { x: 65, y: 20, Icon: ServerIcon, label: 'API server' },
  cdc: { x: 80, y: 80, Icon: ServerIcon, label: 'CDC worker' },
  client: { x: 35, y: 20, Icon: MonitorIcon, label: 'Client' },
  yjs: { x: 20, y: 80, Icon: ServerIcon, label: 'Yjs worker' },
} as const;

type NodeKey = keyof typeof nodes;

// Request–response flow: standard REST (solid, grey = HTTP, bidirectional).
const requestEdges: {
  from: NodeKey;
  to: NodeKey;
  label?: string;
  label2?: string;
  offset?: number;
  labelOffset?: number;
  oneWay?: boolean;
  bidirectional?: boolean;
  stroke?: string;
}[] = [
  { from: 'cdc', to: 'database', label: 'SQL', offset: -6, oneWay: true, labelOffset: -14 },
  { from: 'yjs', to: 'database', label: 'SQL', labelOffset: -14, bidirectional: true },
];

// Stream connections (dashed). Solid = HTTP, dashed = streams. `bidirectional` adds a start arrowhead.
const streamEdges: {
  from: NodeKey;
  to: NodeKey;
  stroke: string;
  label: string;
  label2?: string;
  labelOffset?: number;
  label2Offset?: number;
  offset?: number;
  bidirectional?: boolean;
}[] = [
  { from: 'client', to: 'api', stroke: 'var(--primary)', label: 'HTTP', offset: 10, bidirectional: true },
  { from: 'api', to: 'database', stroke: 'var(--primary)', label: 'SQL', labelOffset: 22, bidirectional: true },
  { from: 'database', to: 'cdc', stroke: '#eab308', label: 'WAL stream', offset: -8, labelOffset: -14 },
  { from: 'cdc', to: 'api', stroke: '#3b82f6', label: 'Changes', labelOffset: 30 },
  { from: 'api', to: 'client', stroke: '#22c55e', label: 'SSE', labelOffset: 14, offset: 4 },
  { from: 'client', to: 'yjs', stroke: '#a855f7', label: 'Changes', labelOffset: 30, bidirectional: true },
];

// Which nodes and edges participate in each mode. Edge keys are `${from}-${to}`.
const modeConfig: Record<SyncMode, { nodes: NodeKey[]; edges: string[] }> = {
  rest: {
    nodes: ['database', 'api', 'client'],
    edges: ['client-api', 'api-database'],
  },
  cdc: {
    nodes: ['database', 'api', 'cdc', 'client'],
    edges: ['client-api', 'api-database', 'cdc-database', 'database-cdc', 'cdc-api', 'api-client'],
  },
  yjs: {
    nodes: ['database', 'api', 'cdc', 'client', 'yjs'],
    edges: [
      'client-api',
      'api-database',
      'cdc-database',
      'database-cdc',
      'cdc-api',
      'api-client',
      'client-yjs',
      'yjs-database',
    ],
  },
};

// Short explanation shown between the toggle and the diagram, per part.
// `label` and `text` are i18n keys (about namespace); `text` carries inline <strong> markup.
const modeText: Record<SyncMode, { label: string; text: string }> = {
  rest: { label: 'about:sync_diagram.part_1.label', text: 'about:sync_diagram.part_1.text' },
  cdc: { label: 'about:sync_diagram.part_2.label', text: 'about:sync_diagram.part_2.text' },
  yjs: { label: 'about:sync_diagram.part_3.label', text: 'about:sync_diagram.part_3.text' },
};

// Animation timeline (seconds): base REST fades in and holds, then the mode-specific node fades
// in and the stream/branch lines draw in flow order.
const ANIM = { fade: 0.6, hold: 1, cdcIn: 0.6, draw: 0.9, sqlDraw: 0.6, gap: 0.4 } as const;

type EdgeTiming = { delay: number; duration: number; draw: boolean };

// Build the per-mode node/edge timeline. `lead` is the pause before the mode-specific
// node appears: the full hold on first reveal, but ~0 on a toggle (base already visible).
const buildTimeline = (lead: number) => {
  // CDC timeline.
  const T_CDC = ANIM.fade + lead;
  const T_REPLICATION = T_CDC + ANIM.cdcIn + ANIM.gap;
  const T_SQL_CDC = T_REPLICATION + ANIM.draw + ANIM.gap;
  const T_WS = T_SQL_CDC + ANIM.sqlDraw + ANIM.gap;
  const T_SSE = T_WS + ANIM.draw + ANIM.gap;

  // The Yjs timeline adds the collaboration path to the full CDC flow.
  const T_YJS_NODE = T_SSE + ANIM.draw + ANIM.gap;
  const T_WS_YJS = T_YJS_NODE + ANIM.cdcIn + ANIM.gap;
  const T_YJS_PERSIST = T_WS_YJS + ANIM.draw + ANIM.gap;

  // Per-node fade-in delay per mode (the mode-specific node appears last).
  const nodeDelay: Record<SyncMode, Partial<Record<NodeKey, number>>> = {
    rest: { database: 0, api: 0, client: 0 },
    cdc: { database: 0, api: 0, client: 0, cdc: T_CDC },
    yjs: { database: 0, api: 0, client: 0, cdc: T_CDC, yjs: T_YJS_NODE },
  };

  // Per-edge animation per mode: `draw` lines are stroked along their trajectory, others fade.
  const edgeAnim: Record<SyncMode, Record<string, EdgeTiming>> = {
    rest: {
      'client-api': { delay: 0, duration: ANIM.fade, draw: false },
      'api-database': { delay: 0, duration: ANIM.fade, draw: false },
    },
    cdc: {
      'client-api': { delay: 0, duration: ANIM.fade, draw: false },
      'api-database': { delay: 0, duration: ANIM.fade, draw: false },
      'cdc-database': { delay: T_SQL_CDC, duration: ANIM.sqlDraw, draw: true },
      'database-cdc': { delay: T_REPLICATION, duration: ANIM.draw, draw: true },
      'cdc-api': { delay: T_WS, duration: ANIM.draw, draw: true },
      'api-client': { delay: T_SSE, duration: ANIM.draw, draw: true },
    },
    yjs: {
      'client-api': { delay: 0, duration: ANIM.fade, draw: false },
      'api-database': { delay: 0, duration: ANIM.fade, draw: false },
      'cdc-database': { delay: T_SQL_CDC, duration: ANIM.sqlDraw, draw: true },
      'database-cdc': { delay: T_REPLICATION, duration: ANIM.draw, draw: true },
      'cdc-api': { delay: T_WS, duration: ANIM.draw, draw: true },
      'api-client': { delay: T_SSE, duration: ANIM.draw, draw: true },
      'client-yjs': { delay: T_WS_YJS, duration: ANIM.draw, draw: true },
      'yjs-database': { delay: T_YJS_PERSIST, duration: ANIM.sqlDraw, draw: true },
    },
  };

  return { nodeDelay, edgeAnim };
};
const fallbackAnim = { delay: 0, duration: ANIM.fade, draw: false };

// Extra breathing room (px) kept between a line end and the icon box edge.
// Labels sit on the outer side of each node, so this only needs to clear the box.
const EDGE_PADDING = 8;

type Point = { x: number; y: number };
type Geometry = { width: number; height: number; centers: Record<string, Point>; radii: Record<string, number> };

export const SyncDiagram = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [geom, setGeom] = useState<Geometry | null>(null);
  // Tracks which draw-mode lines have finished, so arrowheads/dashes appear only then.
  const [drawn, setDrawn] = useState<Record<string, boolean>>({});
  // Active sync mode; drives which nodes/edges render and which timeline runs.
  const [mode, setMode] = useState<SyncMode>('rest');
  const activeNodes = modeConfig[mode].nodes;
  const activeEdges = modeConfig[mode].edges;
  // Edges this part introduces (vs the previous part); only these get moving dashes so each
  // part visually highlights just its own new flow while earlier lines sit static.
  const prevMode = (['rest', 'cdc', 'yjs'] as const)[(['rest', 'cdc', 'yjs'] as const).indexOf(mode) - 1];
  const introducedEdges = new Set(
    activeEdges.filter((edge) => !prevMode || !modeConfig[prevMode].edges.includes(edge)),
  );
  // Lead-in before the mode-specific node appears: full hold on first reveal, ~0 on a toggle.
  const [lead, setLead] = useState<number>(ANIM.hold);
  // Edge whose label is revealed on hover (inherited labels are hidden until hovered/near).
  const [hovered, setHovered] = useState<string | null>(null);
  // Clicking the diagram toggles a "reveal every label" override on/off.
  const [showAllLabels, setShowAllLabels] = useState(false);
  // Time (s) subtracted from delays so a toggle animates only the new part. The
  // shared structure from earlier parts stays put while the new flow draws in from t≈0.
  const [rebase, setRebase] = useState(0);
  // "Try me" hint nudges the user to interact; hidden as soon as they switch parts.
  const [hint, setHint] = useState(true);
  const { nodeDelay, edgeAnim } = buildTimeline(lead);
  const { t } = useTranslation();

  // Switch parts: keep everything the previous part already showed, animate only the delta.
  const switchMode = (target: SyncMode) => {
    if (target === mode) return;
    setHint(false);
    const prev = modeConfig[mode];
    const next = modeConfig[target];
    const newEdges = next.edges.filter((edge) => !prev.edges.includes(edge));
    const { nodeDelay: nd, edgeAnim: ea } = buildTimeline(0);
    const newDelays = [
      ...newEdges.map((edge) => ea[target][edge]?.delay ?? 0),
      ...next.nodes.filter((node) => !prev.nodes.includes(node)).map((node) => nd[target][node] ?? 0),
    ];
    setRebase(newDelays.length ? Math.min(...newDelays) : 0);
    setLead(0);
    setDrawn((prevDrawn) => {
      const draft = { ...prevDrawn };
      for (const edge of newEdges) delete draft[edge];
      return draft;
    });
    setMode(target);
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
      const radii: Record<string, number> = {};
      for (const key of Object.keys(nodes)) {
        const box = boxRefs.current[key];
        if (!box) continue;
        const bRect = box.getBoundingClientRect();
        centers[key] = {
          x: bRect.left + bRect.width / 2 - cRect.left,
          y: bRect.top + bRect.height / 2 - cRect.top,
        };
        // Trim to the box's corner radius so diagonal lines clear it too.
        radii[key] = Math.hypot(bRect.width, bRect.height) / 2 + EDGE_PADDING;
      }
      setGeom({ width: cRect.width, height: cRect.height, centers, radii });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [mode]);

  // Shorten a segment to each node's measured edge (in real px space).
  // `offset` shifts the whole line perpendicular, to run parallel lines side by side.
  const trimmedLine = (from: NodeKey, to: NodeKey, offset = 0) => {
    if (!geom) return null;
    const a = geom.centers[from];
    const b = geom.centers[to];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy * offset;
    const py = ux * offset;
    return {
      x1: a.x + ux * geom.radii[from] + px,
      y1: a.y + uy * geom.radii[from] + py,
      x2: b.x - ux * geom.radii[to] + px,
      y2: b.y - uy * geom.radii[to] + py,
    };
  };

  // Midpoint of a line, nudged perpendicular so the label sits beside the line.
  const labelPos = (line: { x1: number; y1: number; x2: number; y2: number }, offset = 12) => {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: (line.x1 + line.x2) / 2 + (-dy / len) * offset,
      y: (line.y1 + line.y2) / 2 + (dx / len) * offset,
    };
  };

  return (
    <div className="mx-auto mb-8 flex w-full max-w-3xl flex-col items-center">
      {/* Mode toggle switches the diagram's nodes, edges, and timeline. */}
      <div className="relative mb-6">
        {hint && (
          <div className="absolute top-1/2 right-full mr-3 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-muted-foreground max-sm:hidden">
            {t('about:try_me')}
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', duration: 1 }}
            >
              <ArrowRightIcon />
            </motion.span>
          </div>
        )}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value) switchMode(value as SyncMode);
          }}
          variant="merged"
        >
          <ToggleGroupItem value="rest">{t(modeText.rest.label)}</ToggleGroupItem>
          <ToggleGroupItem value="cdc">{t(modeText.cdc.label)}</ToggleGroupItem>
          <ToggleGroupItem value="yjs">{t(modeText.yjs.label)}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Per-part explanation, tied to the selected toggle (old fades out, new fades in) */}
      <AnimatePresence mode="wait">
        <motion.p
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="mx-auto mb-4 max-w-2xl font-light text-muted-foreground text-sm sm:text-center"
        >
          <Trans
            t={t}
            i18nKey={modeText[mode].text}
            components={{ strong: <strong className="font-normal text-foreground" /> }}
          />
        </motion.p>
      </AnimatePresence>

      {/* biome-ignore lint/a11y/useSemanticElements: decorative diagram acts as a click-to-reveal toggle; a real <button> can't wrap the SVG + absolutely-positioned nodes */}
      <div
        ref={containerRef}
        onClick={() => setShowAllLabels((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowAllLabels((v) => !v);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={showAllLabels}
        aria-label="Toggle all data-flow labels"
        className="relative aspect-4/3 w-full cursor-pointer sm:aspect-video md:aspect-5/2"
      >
        {/* SVG overlay drawn in real pixel space and re-measured on resize. */}
        {geom && (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${geom.width} ${geom.height}`}
            aria-hidden="true"
          >
            <title>Cella sync engine data flow</title>

            {/* Request–response: solid neutral lines (bidirectional = HTTP) */}
            <g>
              <defs>
                <marker
                  id="request-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
                </marker>
                <marker
                  id="request-arrow-primary"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
              </defs>
              {requestEdges.map(
                ({ from, to, label, label2, offset, labelOffset, oneWay, bidirectional, stroke = '#9ca3af' }) => {
                  const key = `${from}-${to}`;
                  if (!activeEdges.includes(key)) return null;
                  const line = trimmedLine(from, to, offset);
                  if (!line) return null;
                  const anim = edgeAnim[mode][key] ?? fallbackAnim;
                  const lp = label ? labelPos(line, labelOffset) : null;
                  const lp2 = label2 ? labelPos(line, -(labelOffset ?? 12)) : null;
                  const showEnd = !anim.draw || drawn[key];
                  const delay = startDelay(anim.delay, drawn[key]);
                  const labelDelay = delay + (anim.draw ? anim.duration : 0);
                  const markerId = stroke === '#9ca3af' ? 'request-arrow' : 'request-arrow-primary';
                  // Inherited labels stay hidden until the line (or near it) is hovered.
                  const relevant = introducedEdges.has(key);
                  const showLabel = relevant || hovered === key || showAllLabels;
                  return (
                    <g
                      key={key}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                    >
                      {/* Wide transparent hit area so hovering near the line reveals its label. */}
                      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={20} />
                      <motion.line
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke={stroke}
                        strokeWidth={2}
                        strokeLinecap="round"
                        markerStart={
                          bidirectional
                            ? showEnd
                              ? `url(#${markerId})`
                              : undefined
                            : oneWay || anim.draw
                              ? undefined
                              : `url(#${markerId})`
                        }
                        markerEnd={showEnd ? `url(#${markerId})` : undefined}
                        initial={anim.draw ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
                        animate={anim.draw ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
                        transition={
                          anim.draw
                            ? {
                                pathLength: { delay, duration: anim.duration, ease: 'easeInOut' },
                                opacity: { delay, duration: 0.001 },
                              }
                            : { delay, duration: anim.duration, ease: 'easeInOut' }
                        }
                        onAnimationComplete={anim.draw ? () => setDrawn((d) => ({ ...d, [key]: true })) : undefined}
                      />
                      {lp && (
                        <motion.text
                          x={lp.x}
                          y={lp.y}
                          fill={stroke}
                          fontSize={11}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: showLabel ? 1 : 0 }}
                          transition={{ delay: relevant ? labelDelay : 0, duration: 0.3 }}
                        >
                          {label}
                        </motion.text>
                      )}
                      {lp2 && (
                        <motion.text
                          x={lp2.x}
                          y={lp2.y}
                          fill={stroke}
                          fontSize={11}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: showLabel ? 1 : 0 }}
                          transition={{ delay: relevant ? labelDelay : 0, duration: 0.3 }}
                        >
                          {label2}
                        </motion.text>
                      )}
                    </g>
                  );
                },
              )}
            </g>

            {/* Streams: dashed colored lines with matching arrowheads (WAL / WebSocket / SSE) */}
            <defs>
              {streamEdges.map(({ from, to, stroke }) => (
                <marker
                  key={`arrow-${from}-${to}`}
                  id={`stream-arrow-${from}-${to}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
                </marker>
              ))}
            </defs>
            {streamEdges.map(
              ({ from, to, stroke, label, label2, labelOffset, label2Offset, offset, bidirectional }) => {
                const key = `${from}-${to}`;
                if (!activeEdges.includes(key)) return null;
                const line = trimmedLine(from, to, offset);
                if (!line) return null;
                const anim = edgeAnim[mode][key] ?? fallbackAnim;
                const lp = labelPos(line, labelOffset);
                const lp2 = label2 ? labelPos(line, -(label2Offset ?? labelOffset ?? 12)) : null;
                const delay = startDelay(anim.delay, drawn[key]);
                const labelDelay = delay + anim.duration;
                // Only the part that introduces an edge animates its dashes; earlier lines sit still.
                const animateDashes = introducedEdges.has(key);
                // Inherited labels stay hidden until the line (or near it) is hovered.
                const showLabel = animateDashes || hovered === key || showAllLabels;
                // Bidirectional streams render as one line with an arrowhead at each end, split
                // into two collinear halves (with a small center gap) whose dashes flow outward.
                const flowLanes = (() => {
                  if (!bidirectional) return [{ seg: line, dir: -10, lane: 'flow' }];
                  const dx = line.x2 - line.x1;
                  const dy = line.y2 - line.y1;
                  const len = Math.hypot(dx, dy) || 1;
                  const ux = dx / len;
                  const uy = dy / len;
                  const gap = 3;
                  const mx = (line.x1 + line.x2) / 2;
                  const my = (line.y1 + line.y2) / 2;
                  return [
                    // From center toward `to` (arrowhead at `to`), dashes flow toward `to`.
                    {
                      seg: { x1: mx + ux * gap, y1: my + uy * gap, x2: line.x2, y2: line.y2 },
                      dir: -10,
                      lane: 'fwd',
                    },
                    // From center toward `from` (arrowhead at `from`), dashes flow toward `from`.
                    {
                      seg: { x1: mx - ux * gap, y1: my - uy * gap, x2: line.x1, y2: line.y1 },
                      dir: -10,
                      lane: 'rev',
                    },
                  ];
                })();
                return (
                  <g
                    key={key}
                    onMouseEnter={() => setHovered(key)}
                    onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                  >
                    {/* Wide transparent hit area so hovering near the line reveals its label. */}
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={20} />
                    {drawn[key] ? (
                      flowLanes.map(({ seg, dir, lane }) => (
                        <motion.line
                          key={`${key}-${lane}`}
                          x1={seg.x1}
                          y1={seg.y1}
                          x2={seg.x2}
                          y2={seg.y2}
                          stroke={stroke}
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeDasharray="5 5"
                          markerEnd={`url(#stream-arrow-${from}-${to})`}
                          animate={{ strokeDashoffset: animateDashes ? [0, dir] : 0 }}
                          transition={
                            animateDashes
                              ? { repeat: Number.POSITIVE_INFINITY, ease: 'linear', duration: 0.6 }
                              : { duration: 0 }
                          }
                        />
                      ))
                    ) : (
                      <motion.line
                        key={`${key}-draw`}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke={stroke}
                        strokeWidth={2}
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{
                          pathLength: { delay, duration: anim.duration, ease: 'easeInOut' },
                          opacity: { delay, duration: 0.001 },
                        }}
                        onAnimationComplete={() => setDrawn((d) => ({ ...d, [key]: true }))}
                      />
                    )}
                    <motion.text
                      x={lp.x}
                      y={lp.y}
                      fill={stroke}
                      fontSize={11}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: showLabel ? 1 : 0 }}
                      transition={{ delay: animateDashes ? labelDelay : 0, duration: 0.3 }}
                    >
                      {label}
                    </motion.text>
                    {lp2 && (
                      <motion.text
                        x={lp2.x}
                        y={lp2.y}
                        fill={stroke}
                        fontSize={11}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: showLabel ? 1 : 0 }}
                        transition={{ delay: animateDashes ? labelDelay : 0, duration: 0.3 }}
                      >
                        {label2}
                      </motion.text>
                    )}
                  </g>
                );
              },
            )}
          </svg>
        )}

        {/* Icon nodes positioned absolutely over the SVG */}
        {Object.entries(nodes).map(([key, { x, y, Icon, label }]) => {
          if (!activeNodes.includes(key as NodeKey)) return null;
          const isLastNode = (mode === 'cdc' && key === 'cdc') || (mode === 'yjs' && key === 'yjs');
          return (
            <motion.div
              key={key}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 ${y < 50 ? 'flex-col-reverse' : 'flex-col'}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                delay: startDelay(nodeDelay[mode][key as NodeKey] ?? 0),
                duration: isLastNode ? ANIM.cdcIn : ANIM.fade,
              }}
            >
              <div
                ref={(el) => {
                  boxRefs.current[key] = el;
                }}
                className="flex size-11 items-center justify-center rounded-xl border bg-background shadow-sm sm:size-14 md:size-16"
              >
                <Icon className="size-5 text-foreground sm:size-7 md:size-8" strokeWidth={1.5} />
              </div>
              <span className="truncate text-muted-foreground text-xs">{label}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
