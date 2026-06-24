import { DatabaseIcon, MonitorIcon, ServerIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Node positions in a 0–100 coordinate space (percentages of the container).
// Keeping them here makes it easy to nudge layout and later anchor connector lines.
const nodes = {
  database: { x: 41, y: 78, Icon: DatabaseIcon, label: 'Postgres DB' },
  api: { x: 59, y: 22, Icon: ServerIcon, label: 'API server' },
  cdc: { x: 77, y: 78, Icon: ServerIcon, label: 'CDC worker' },
  client: { x: 23, y: 22, Icon: MonitorIcon, label: 'Client' },
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
  stroke?: string;
}[] = [
  { from: 'client', to: 'api', label: 'HTTP (fetch)', offset: 10, stroke: 'var(--primary)' },
  { from: 'api', to: 'database', label: 'SQL', labelOffset: 22, stroke: 'var(--primary)' },
  { from: 'cdc', to: 'database', label: 'SQL', offset: -6, oneWay: true, labelOffset: -14 },
];

// Stream connections (dashed, unidirectional). Solid = HTTP, dashed = streams.
const streamEdges: {
  from: NodeKey;
  to: NodeKey;
  stroke: string;
  label: string;
  label2?: string;
  labelOffset?: number;
  label2Offset?: number;
  offset?: number;
}[] = [
  { from: 'database', to: 'cdc', stroke: '#eab308', label: 'WAL stream', offset: -8, labelOffset: -14 },
  { from: 'cdc', to: 'api', stroke: '#3b82f6', label: 'Changes', labelOffset: 30 },
  { from: 'api', to: 'client', stroke: '#22c55e', label: 'SSE (notify only)', labelOffset: 14, offset: 4 },
];

// ── Animation timeline (seconds) ────────────────────────────────────────────────────
// Base REST (Postgres/OpenAPI/React Query + HTTP & SQL lines) fades in and holds,
// then the CDC worker fades in and the stream/branch lines draw in flow order.
const ANIM = { fade: 0.6, hold: 1, cdcIn: 0.6, draw: 0.9, sqlDraw: 0.6, gap: 0.4 } as const;
const T_CDC = ANIM.fade + ANIM.hold;
const T_REPLICATION = T_CDC + ANIM.cdcIn + ANIM.gap;
const T_SQL_CDC = T_REPLICATION + ANIM.draw + ANIM.gap;
const T_WS = T_SQL_CDC + ANIM.sqlDraw + ANIM.gap;
const T_SSE = T_WS + ANIM.draw + ANIM.gap;

// Per-node fade-in delay (CDC appears last to emphasize the base REST structure).
const nodeDelay: Record<NodeKey, number> = { database: 0, api: 0, client: 0, cdc: T_CDC };

// Per-edge animation: `draw` lines are stroked along their trajectory, others fade.
const edgeAnim: Record<string, { delay: number; duration: number; draw: boolean }> = {
  'client-api': { delay: 0, duration: ANIM.fade, draw: false },
  'api-database': { delay: 0, duration: ANIM.fade, draw: false },
  'cdc-database': { delay: T_SQL_CDC, duration: ANIM.sqlDraw, draw: true },
  'database-cdc': { delay: T_REPLICATION, duration: ANIM.draw, draw: true },
  'cdc-api': { delay: T_WS, duration: ANIM.draw, draw: true },
  'api-client': { delay: T_SSE, duration: ANIM.draw, draw: true },
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
  // Restart the timeline whenever the diagram enters the viewport.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset drawn lines when the diagram leaves the viewport so they redraw on re-entry.
  useEffect(() => {
    if (!inView) setDrawn({});
  }, [inView]);

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
  }, []);

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
    <div ref={containerRef} className="relative mx-auto aspect-square w-full max-w-3xl sm:aspect-3/2 md:aspect-2/1">
      {/* SVG overlay — drawn in real pixel space, re-measured on resize */}
      {geom && (
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${geom.width} ${geom.height}`} aria-hidden="true">
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
            {requestEdges.map(({ from, to, label, label2, offset, labelOffset, oneWay, stroke = '#9ca3af' }) => {
              const line = trimmedLine(from, to, offset);
              if (!line) return null;
              const key = `${from}-${to}`;
              const anim = edgeAnim[key] ?? fallbackAnim;
              const lp = label ? labelPos(line, labelOffset) : null;
              const lp2 = label2 ? labelPos(line, -(labelOffset ?? 12)) : null;
              const showEnd = !anim.draw || drawn[key];
              const labelDelay = anim.delay + (anim.draw ? anim.duration : 0);
              const markerId = stroke === '#9ca3af' ? 'request-arrow' : 'request-arrow-primary';
              return (
                <g key={key}>
                  <motion.line
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    markerStart={oneWay || anim.draw ? undefined : `url(#${markerId})`}
                    markerEnd={showEnd ? `url(#${markerId})` : undefined}
                    initial={anim.draw ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
                    animate={
                      inView
                        ? anim.draw
                          ? { pathLength: 1, opacity: 1 }
                          : { opacity: 1 }
                        : anim.draw
                          ? { pathLength: 0, opacity: 0 }
                          : { opacity: 0 }
                    }
                    transition={
                      inView
                        ? anim.draw
                          ? {
                              pathLength: { delay: anim.delay, duration: anim.duration, ease: 'easeInOut' },
                              opacity: { delay: anim.delay, duration: 0.001 },
                            }
                          : { delay: anim.delay, duration: anim.duration, ease: 'easeInOut' }
                        : { duration: 0.3 }
                    }
                    onAnimationComplete={
                      anim.draw ? () => inView && setDrawn((d) => ({ ...d, [key]: true })) : undefined
                    }
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
                      animate={inView ? { opacity: 1 } : { opacity: 0 }}
                      transition={inView ? { delay: labelDelay, duration: 0.4 } : { duration: 0.2 }}
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
                      animate={inView ? { opacity: 1 } : { opacity: 0 }}
                      transition={inView ? { delay: labelDelay, duration: 0.4 } : { duration: 0.2 }}
                    >
                      {label2}
                    </motion.text>
                  )}
                </g>
              );
            })}
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
          {streamEdges.map(({ from, to, stroke, label, label2, labelOffset, label2Offset, offset }) => {
            const line = trimmedLine(from, to, offset);
            if (!line) return null;
            const key = `${from}-${to}`;
            const anim = edgeAnim[key] ?? fallbackAnim;
            const lp = labelPos(line, labelOffset);
            const lp2 = label2 ? labelPos(line, -(label2Offset ?? labelOffset ?? 12)) : null;
            const labelDelay = anim.delay + anim.duration;
            return (
              <g key={key}>
                {drawn[key] ? (
                  <motion.line
                    key={`${key}-flow`}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={stroke}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="5 5"
                    markerEnd={`url(#stream-arrow-${from}-${to})`}
                    animate={{ strokeDashoffset: [0, -10] }}
                    transition={{ repeat: Number.POSITIVE_INFINITY, ease: 'linear', duration: 0.6 }}
                  />
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
                    animate={inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                    transition={
                      inView
                        ? {
                            pathLength: { delay: anim.delay, duration: anim.duration, ease: 'easeInOut' },
                            opacity: { delay: anim.delay, duration: 0.001 },
                          }
                        : { duration: 0.3 }
                    }
                    onAnimationComplete={() => inView && setDrawn((d) => ({ ...d, [key]: true }))}
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
                  animate={inView ? { opacity: 1 } : { opacity: 0 }}
                  transition={inView ? { delay: labelDelay, duration: 0.4 } : { duration: 0.2 }}
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
                    animate={inView ? { opacity: 1 } : { opacity: 0 }}
                    transition={inView ? { delay: labelDelay, duration: 0.4 } : { duration: 0.2 }}
                  >
                    {label2}
                  </motion.text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {/* Icon nodes positioned absolutely over the SVG */}
      {Object.entries(nodes).map(([key, { x, y, Icon, label }]) => (
        <motion.div
          key={key}
          className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 ${y < 50 ? 'flex-col-reverse' : 'flex-col'}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : { opacity: 0 }}
          transition={
            inView
              ? { delay: nodeDelay[key as NodeKey], duration: key === 'cdc' ? ANIM.cdcIn : ANIM.fade }
              : { duration: 0.3 }
          }
        >
          <div
            ref={(el) => {
              boxRefs.current[key] = el;
            }}
            className="flex size-11 items-center justify-center rounded-xl border bg-background shadow-sm sm:size-14 md:size-16"
          >
            <Icon className="size-5 text-foreground sm:size-7 md:size-8" strokeWidth={1.5} />
          </div>
          <span className="text-[10px] text-muted-foreground sm:text-xs">{label}</span>
        </motion.div>
      ))}
    </div>
  );
};
