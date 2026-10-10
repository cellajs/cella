import { ArrowRightIcon, DatabaseIcon, MonitorIcon, ServerIcon } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useInView } from '~/hooks/use-in-view';
import type { TKey } from '~/lib/i18n-locales';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { cn } from '~/utils/cn';

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

// REST request/response flow, drawn as solid grey lines.
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
  { from: 'yjs', to: 'api', label: 'Save', labelOffset: 14, oneWay: true },
];

// Stream connections, drawn dashed. `bidirectional` adds a start arrowhead. `id` names a second line between the same two nodes.
const streamEdges: {
  id?: string;
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
  // Part 4: the workers run inside the API server's VM, so their two outside connections end at that VM.
  { id: 'vm-wal', from: 'database', to: 'api', stroke: '#eab308', label: 'WAL stream', offset: 12, labelOffset: 44 },
  { id: 'vm-socket', from: 'client', to: 'api', stroke: '#a855f7', label: 'Changes', offset: 24, labelOffset: 14, bidirectional: true },
];

const edgeKey = (edge: { id?: string; from: NodeKey; to: NodeKey }) => edge.id ?? `${edge.from}-${edge.to}`;

const edgeByKey: Record<string, { from: NodeKey; to: NodeKey; offset?: number; stroke?: string }> = Object.fromEntries(
  [...requestEdges, ...streamEdges].map((edge) => [edgeKey(edge), edge]),
);

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

// Short explanation shown between the toggle and the diagram, per part.
// `label` and `text` are i18n keys (about namespace); `text` carries inline <strong> markup.
const modeText: Record<SyncMode, { label: TKey; text: TKey }> = {
  rest: { label: 'about:sync_diagram.part_1.label', text: 'about:sync_diagram.part_1.text' },
  cdc: { label: 'about:sync_diagram.part_2.label', text: 'about:sync_diagram.part_2.text' },
  yjs: { label: 'about:sync_diagram.part_3.label', text: 'about:sync_diagram.part_3.text' },
  vm: { label: 'about:sync_diagram.part_4.label', text: 'about:sync_diagram.part_4.text' },
};

// Animation timeline (seconds): base REST fades in and holds, then the mode-specific node fades
// in and the stream/branch lines draw in flow order.
const ANIM = { fade: 0.6, hold: 1, cdcIn: 0.6, draw: 0.9, sqlDraw: 0.6, gap: 0.4 } as const;

// Part 4 folds the workers into the API server with the same two moves, also in reverse: their lines pull back, the workers fade
// out, the server widens into one VM that holds them, and the two outside connections draw again.
const FOLD = { retract: 0.5, stagger: 0.08, fade: 0.5, morph: 0.6, swap: 0.3 } as const;

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

type EdgeTiming = { delay: number; duration: number; draw: boolean };

// `lead` is the pause before the mode-specific node appears: the full hold on first reveal, 0 on a toggle.
// `foldAt` is when the last worker line has pulled back in Part 4, which runs on its own clock from the switch.
const buildTimeline = (lead: number, foldAt = 0) => {
  const T_CDC = ANIM.fade + lead;
  const T_REPLICATION = T_CDC + ANIM.cdcIn + ANIM.gap;
  const T_SQL_CDC = T_REPLICATION + ANIM.draw + ANIM.gap;
  const T_WS = T_SQL_CDC + ANIM.sqlDraw + ANIM.gap;
  const T_SSE = T_WS + ANIM.draw + ANIM.gap;

  // The Yjs timeline adds the collaboration path to the full CDC flow.
  const T_YJS_NODE = T_SSE + ANIM.draw + ANIM.gap;
  const T_WS_YJS = T_YJS_NODE + ANIM.cdcIn + ANIM.gap;
  const T_YJS_PERSIST = T_WS_YJS + ANIM.draw + ANIM.gap;
  const T_YJS_SAVE = T_YJS_PERSIST + ANIM.sqlDraw + ANIM.gap;

  // The VM timeline: fold, widen, then draw the two connections to the VM.
  const T_VM_DRAW = foldAt + FOLD.morph + ANIM.gap;
  const vmAt = { fold: foldAt, workers: foldAt + FOLD.swap };

  const nodeDelay: Record<SyncMode, Partial<Record<NodeKey, number>>> = {
    rest: { database: 0, api: 0, client: 0 },
    cdc: { database: 0, api: 0, client: 0, cdc: T_CDC },
    yjs: { database: 0, api: 0, client: 0, cdc: T_CDC, yjs: T_YJS_NODE },
    vm: { database: 0, api: 0, client: 0 },
  };

  // `draw` lines are stroked along their trajectory; the rest fade in.
  const edgeAnim: Record<SyncMode, Record<string, EdgeTiming>> = {
    rest: { 'client-api': { delay: 0, duration: ANIM.fade, draw: false }, 'api-database': { delay: 0, duration: ANIM.fade, draw: false } },
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
      'yjs-api': { delay: T_YJS_SAVE, duration: ANIM.draw, draw: true },
    },
    vm: {
      'client-api': { delay: 0, duration: ANIM.fade, draw: false },
      'api-database': { delay: 0, duration: ANIM.fade, draw: false },
      'api-client': { delay: T_VM_DRAW, duration: ANIM.draw, draw: true },
      'vm-wal': { delay: T_VM_DRAW, duration: ANIM.draw, draw: true },
      'vm-socket': { delay: T_VM_DRAW + ANIM.gap, duration: ANIM.draw, draw: true },
    },
  };

  return { nodeDelay, edgeAnim, vmAt };
};
const fallbackAnim = { delay: 0, duration: ANIM.fade, draw: false };
// Runs of the 0.6 s dash cycle per start: 4.8 s, under the five seconds after which moving content needs a pause control.
const DASH_RUNS = 8;

// Extra room (px) kept between a line end and the icon box edge.
const EDGE_PADDING = 8;

type Point = { x: number; y: number };
type Geometry = { width: number; height: number; centers: Record<string, Point>; halves: Record<string, { w: number; h: number }> };

export function SyncDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [geom, setGeom] = useState<Geometry | null>(null);
  // Tracks which draw-mode lines have finished, so arrowheads/dashes appear only then.
  const [drawn, setDrawn] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<SyncMode>('rest');
  const activeNodes = modeConfig[mode].nodes;
  const activeEdges = modeConfig[mode].edges;
  // Only edges a part introduces get moving dashes; earlier lines stay static. Part 4 is the exception: there every line flows.
  const prevMode = modeOrder[modeOrder.indexOf(mode) - 1];
  const introducedEdges = new Set(activeEdges.filter((edge) => !prevMode || !modeConfig[prevMode].edges.includes(edge)));
  const [lead, setLead] = useState<number>(ANIM.hold);
  // What the previous part showed and Part 4 folds away: these stay mounted to pull back and fade out.
  const [fold, setFold] = useState<Fold>(noFold);
  const foldAt = fold.edges.length ? (fold.edges.length - 1) * FOLD.stagger + FOLD.retract : 0;
  const isVm = mode === 'vm';
  // Edge whose label is revealed on hover (inherited labels are hidden until hovered/near).
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(false);
  // Time (s) subtracted from delays so a toggle animates only the new part. The
  // shared structure from earlier parts stays put while the new flow draws in from t≈0.
  const [rebase, setRebase] = useState(0);
  const [hint, setHint] = useState(true);
  const { nodeDelay, edgeAnim, vmAt } = buildTimeline(lead, foldAt);
  const { t } = useTranslation();
  // Motion here is finite: the dashes march for under five seconds each time they start, the hint arrow nudges five times,
  // and both rest offscreen, below `sm` (the arrow is hidden there) and for a reader who asked for reduced motion.
  const { ref: inViewRef, inView } = useInView();
  const isMobile = useBreakpointBelow('sm');
  const reducedMotion = useReducedMotion();
  const animateHint = inView && !isMobile && !reducedMotion;

  // Keeps everything the previous part showed and animates only the delta.
  const switchMode = (target: SyncMode) => {
    if (target === mode) return;
    setHint(false);
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
      const { nodeDelay: nd, edgeAnim: ea } = buildTimeline(0);
      const newDelays = [
        ...newEdges.map((edge) => ea[target][edge]?.delay ?? 0),
        ...next.nodes.filter((node) => !prev.nodes.includes(node)).map((node) => nd[target][node] ?? 0),
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
      setGeom({ width: cRect.width, height: cRect.height, centers, halves });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // The API server's box resizes by itself when it widens into the VM, and its lines follow.
    if (boxRefs.current.api) ro.observe(boxRefs.current.api);
    return () => ro.disconnect();
  }, [mode]);

  // How far from a node's center its lines end. A square box gets the circle through its corners, so diagonal lines clear it too.
  // The API server widened into the VM gets its own edges with the same clearance, eased in while it widens.
  const trimOf = (geometry: Geometry, key: NodeKey, ux: number, uy: number) => {
    const { w, h } = geometry.halves[key];
    const stretch = Math.min(1, (w / h - 1) * 2);
    if (stretch <= 0) return Math.hypot(w, h) + EDGE_PADDING;
    const side = geometry.halves.database?.w ?? h;
    const round = Math.SQRT2 * side + EDGE_PADDING;
    const clearance = round - side;
    const edge = Math.min((w + clearance) / (Math.abs(ux) || 1e-6), (h + clearance) / (Math.abs(uy) || 1e-6));
    return round + (edge - round) * stretch;
  };

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
    const fromTrim = trimOf(geom, from, ux, uy);
    const toTrim = trimOf(geom, to, ux, uy);
    return {
      x1: a.x + ux * fromTrim + px,
      y1: a.y + uy * fromTrim + py,
      x2: b.x - ux * toTrim + px,
      y2: b.y - uy * toTrim + py,
    };
  };

  const labelPos = (line: { x1: number; y1: number; x2: number; y2: number }, offset = 12) => {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (line.x1 + line.x2) / 2 + (-dy / len) * offset, y: (line.y1 + line.y2) / 2 + (dx / len) * offset };
  };

  return (
    <div ref={inViewRef} className="mx-auto mb-8 flex w-full max-w-3xl flex-col items-center">
      {/* Mode toggle switches the diagram's nodes, edges, and timeline. */}
      <div className="relative mb-6">
        {hint && (
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
            if (value) switchMode(value as SyncMode);
          }}
          variant="merged"
        >
          <ToggleGroupItem value="rest">{t(modeText.rest.label)}</ToggleGroupItem>
          <ToggleGroupItem value="cdc">{t(modeText.cdc.label)}</ToggleGroupItem>
          <ToggleGroupItem value="yjs">{t(modeText.yjs.label)}</ToggleGroupItem>
          <ToggleGroupItem value="vm">{t(modeText.vm.label)}</ToggleGroupItem>
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
          <svg className="absolute inset-0 size-full" viewBox={`0 0 ${geom.width} ${geom.height}`} aria-hidden="true">
            <title>Cella sync engine data flow</title>

            {/* Part 4: each worker line pulls back into the node that stays, the reverse of how it was drawn. */}
            {fold.edges.map((key, index) => {
              const edge = edgeByKey[key];
              if (!edge) return null;
              const line = fold.nodes.includes(edge.from)
                ? trimmedLine(edge.to, edge.from, -(edge.offset ?? 0))
                : trimmedLine(edge.from, edge.to, edge.offset);
              if (!line) return null;
              const delay = index * FOLD.stagger;
              return (
                <motion.line
                  key={`${key}-retract`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke={edge.stroke ?? '#9ca3af'}
                  strokeWidth={2}
                  strokeLinecap="round"
                  initial={{ pathLength: 1, opacity: 1 }}
                  animate={{ pathLength: 0, opacity: 0 }}
                  transition={{
                    pathLength: { delay, duration: FOLD.retract, ease: 'easeInOut' },
                    opacity: { delay: delay + FOLD.retract, duration: 0.001 },
                  }}
                />
              );
            })}

            <g>
              <defs>
                <marker id="request-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
                </marker>
                <marker id="request-arrow-primary" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
                </marker>
              </defs>
              {requestEdges.map(({ from, to, label, label2, offset, labelOffset, oneWay, bidirectional, stroke = '#9ca3af' }) => {
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
                const relevant = introducedEdges.has(key);
                const showLabel = relevant || hovered === key || showAllLabels;
                return (
                  <g key={key} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered((h) => (h === key ? null : h))}>
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={20} />
                    <motion.line
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke={stroke}
                      strokeWidth={2}
                      strokeLinecap="round"
                      markerStart={(bidirectional ? showEnd : !oneWay && !anim.draw) ? `url(#${markerId})` : undefined}
                      markerEnd={showEnd ? `url(#${markerId})` : undefined}
                      initial={anim.draw ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
                      animate={anim.draw ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
                      transition={
                        anim.draw
                          ? { pathLength: { delay, duration: anim.duration, ease: 'easeInOut' }, opacity: { delay, duration: 0.001 } }
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
              })}
            </g>

            <defs>
              {streamEdges.map(({ stroke, ...edge }) => (
                <marker
                  key={`arrow-${edgeKey(edge)}`}
                  id={`stream-arrow-${edgeKey(edge)}`}
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
            {streamEdges.map(({ id, from, to, stroke, label, label2, labelOffset, label2Offset, offset, bidirectional }) => {
              const key = edgeKey({ id, from, to });
              if (!activeEdges.includes(key)) return null;
              const line = trimmedLine(from, to, offset);
              if (!line) return null;
              const anim = edgeAnim[mode][key] ?? fallbackAnim;
              // In Part 4 the socket line runs where the HTTP label sits, so that label moves below it: right under on hover, a row lower when all labels show.
              const underSocket = isVm && key === 'client-api';
              const lp = labelPos(line, underSocket ? (showAllLabels ? 40 : 28) : labelOffset);
              const lp2 = label2 ? labelPos(line, -(label2Offset ?? labelOffset ?? 12)) : null;
              const delay = startDelay(anim.delay, drawn[key]);
              const labelDelay = delay + anim.duration;
              const animateDashes = introducedEdges.has(key);
              // Part 4 is the whole picture, so all its lines flow, starting together once its last line is drawn.
              const flows = isVm ? Boolean(drawn['vm-wal'] && drawn['vm-socket']) : animateDashes;
              const flowDashes = flows && inView && !reducedMotion;
              // Part 4 names none of its lines by itself, so no line stands out; hover and the label toggle still reveal each name.
              const ownLabel = animateDashes && !isVm;
              const showLabel = ownLabel || hovered === key || showAllLabels;
              // Bidirectional streams split into two collinear halves with a center gap, dashes flowing outward.
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
                  { seg: { x1: mx + ux * gap, y1: my + uy * gap, x2: line.x2, y2: line.y2 }, dir: -10, lane: 'fwd' },
                  { seg: { x1: mx - ux * gap, y1: my - uy * gap, x2: line.x1, y2: line.y1 }, dir: -10, lane: 'rev' },
                ];
              })();
              return (
                <g key={key} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered((h) => (h === key ? null : h))}>
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
                        markerEnd={`url(#stream-arrow-${key})`}
                        animate={{ strokeDashoffset: flowDashes ? [0, dir] : 0 }}
                        transition={flowDashes ? { repeat: DASH_RUNS - 1, ease: 'linear', duration: 0.6 } : { duration: 0 }}
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
                      transition={{ pathLength: { delay, duration: anim.duration, ease: 'easeInOut' }, opacity: { delay, duration: 0.001 } }}
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
                    transition={{ delay: ownLabel ? labelDelay : 0, duration: 0.3 }}
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
                      transition={{ delay: ownLabel ? labelDelay : 0, duration: 0.3 }}
                    >
                      {label2}
                    </motion.text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {Object.entries(nodes).map(([key, { x, y, Icon, label }]) => {
          // A worker Part 4 folds away stays mounted to fade out where it stands.
          const folding = fold.nodes.includes(key as NodeKey);
          if (!activeNodes.includes(key as NodeKey) && !folding) return null;
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
                  ? { delay: vmAt.fold, duration: FOLD.fade }
                  : { delay: startDelay(nodeDelay[mode][key as NodeKey] ?? 0), duration: isLastNode ? ANIM.cdcIn : ANIM.fade }
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
                    style={{ transitionDuration: `${FOLD.morph}s`, transitionDelay: `${isVm ? vmAt.fold : 0}s` }}
                  >
                    <motion.div
                      initial={false}
                      animate={{ opacity: isVm ? 0 : 1 }}
                      transition={{ delay: isVm ? vmAt.fold : FOLD.swap, duration: FOLD.swap }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Icon className="size-5 text-foreground sm:size-7 md:size-8" strokeWidth={1.5} />
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
                          transition={isVm ? { delay: vmAt.workers, duration: FOLD.fade } : { duration: 0.2 }}
                          className="flex flex-col items-center gap-1"
                        >
                          <div className="flex size-6 items-center justify-center rounded-md border sm:size-7 md:size-8">
                            <ServerIcon className="size-3.5 text-foreground sm:size-4" strokeWidth={1.5} />
                          </div>
                          <span className="text-2xs text-muted-foreground leading-none">{worker.label}</span>
                        </motion.div>
                      ))}
                    </div>
                    <motion.span
                      aria-hidden={!isVm}
                      initial={false}
                      animate={{ opacity: isVm ? 1 : 0 }}
                      transition={isVm ? { delay: vmAt.workers, duration: FOLD.swap } : { duration: 0.2 }}
                      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap font-medium text-foreground text-xs"
                    >
                      One VM
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
                  <Icon className="size-5 text-foreground sm:size-7 md:size-8" strokeWidth={1.5} />
                </div>
              )}
              <span
                className={cn('truncate text-muted-foreground text-xs transition-opacity', becomesVm && 'opacity-0')}
                style={{ transitionDuration: `${FOLD.swap}s`, transitionDelay: `${becomesVm ? vmAt.fold : 0}s` }}
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
