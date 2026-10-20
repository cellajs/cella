import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { type BaselineEntry, loadBaseline, RUNNER_EPOCH, saveBaseline } from './baseline';
import { evaluateChecks } from './checks';
import { COUNTED, createHttpClient, errorCode } from './http';
import { type Distribution, type EndpointSummary, Metrics } from './metrics';
import { compactLine, LiveDisplay, liveLines, paint, type SummaryView, summaryLines } from './report';
import { play, roleSequencer, type ScheduleEvent, schedule } from './scheduler';
import { readSse } from './sse';
import type { CheckResult, Phase, Scenario, Vu, VuFn } from './types';

const DEFAULT_INTERVAL_MS = 5000;
const LAG_WARN_MS = 50;
/** The loop-delay sampler's period: it records whole periods, so an idle loop reads this much. */
const LAG_RESOLUTION_MS = 10;
const DEFAULT_DRAIN_TIMEOUT_S = 300;
/** Seconds an aborted VU gets to unwind before the run reports without it. */
const ABORT_GRACE_S = 5;
/** Logs kept per scenario; older ones are deleted. */
const LOGS_KEPT = 30;

export interface RunOptions {
  /** Scenario name: labels the output, the log file and the baseline history. */
  name: string;
  /** Base URL that relative request paths join. */
  target: string;
  /** Holds `baselines/` and `logs/`. */
  dataDir: string;
  short?: boolean;
  /** One result line at the end instead of the full summary. */
  quiet?: boolean;
  /** History of another runner to carry into a scenario's first baseline file. */
  legacyBaselineFile?: string;
  /**
   * The app's own checks of what the run did, after the load stopped. Receives the counters and the runner's checks,
   * so it can skip work on a run whose responses were already rejected.
   */
  afterRun?: (outcome: { counters: Record<string, number>; checks: CheckResult[]; short: boolean }) => Promise<CheckResult[]>;
  /** Where the live display and the summary go; stdout when unset. */
  output?: NodeJS.WriteStream;
}

export interface RunSummary {
  type: 'summary';
  runner: typeof RUNNER_EPOCH;
  scenario: string;
  startedAt: string;
  durationS: number;
  short: boolean;
  vus: { created: number; completed: number; failed: number };
  requests: number;
  requestRate: number;
  http: Distribution | null;
  endpoints: Record<string, EndpointSummary>;
  histograms: Record<string, Distribution>;
  counters: Record<string, number>;
  errors: Record<string, { count: number; message: string }>;
  checks: CheckResult[];
  generatorLagP99MaxMs: number;
  attachments: Record<string, unknown>;
}

export interface RunResult {
  ok: boolean;
  summary: RunSummary;
  /** This run's numbers in baseline shape, also for a run that failed or was short. */
  current: BaselineEntry;
  /** The entry this run was compared against; null when none of this runner epoch exists. */
  baseline: BaselineEntry | null;
  logFile: string;
}

/** Identity: types a scenario module and checks its counter and histogram names, nothing at runtime. */
export function defineScenario<const C extends string = never, const H extends string = never>(scenario: Scenario<C, H>): Scenario<C, H> {
  return scenario;
}

type AnyScenario = Scenario<string, string>;

interface Plan {
  events: ScheduleEvent[] | Generator<ScheduleEvent>;
  phases: Phase[];
  plannedS: number | null;
  pick: () => { role: string | null; fn: VuFn<string, string> };
}

/** The arrivals of a run: the scenario's phases; one VU for `run`; in short mode one VU per role. */
function plan(scenario: AnyScenario, short: boolean): Plan {
  if (scenario.run) {
    const fn = scenario.run;
    return {
      events: [
        { kind: 'phase', at: 0, phase: 0 },
        { kind: 'arrival', at: 0, phase: 0 },
      ],
      phases: [{ name: 'run', duration: 0 }],
      plannedS: null,
      pick: () => ({ role: null, fn }),
    };
  }
  const roles = scenario.roles ?? [{ name: '', weight: 1, vu: scenario.vu }];
  if (roles.some((role) => !(role.weight > 0))) throw new Error('every role needs a weight above 0');
  const next = roleSequencer(roles);
  const pick = () => {
    const role = next();
    return { role: scenario.roles ? role.name : null, fn: role.vu };
  };
  if (short) {
    let i = 0;
    const events: ScheduleEvent[] = [{ kind: 'phase', at: 0, phase: 0 }, ...roles.map((): ScheduleEvent => ({ kind: 'arrival', at: 0, phase: 0 }))];
    const pickEach = () => {
      const role = roles[i++ % roles.length];
      return { role: scenario.roles ? role.name : null, fn: role.vu };
    };
    return { events, phases: [{ name: 'smoke', duration: 1 }], plannedS: 1, pick: pickEach };
  }
  const plannedS = scenario.phases.reduce((sum, phase) => sum + phase.duration, 0);
  return { events: schedule(scenario.phases), phases: scenario.phases, plannedS, pick };
}

function logFileFor(dataDir: string, name: string, startedAt: Date): string {
  const dir = join(dataDir, 'logs');
  mkdirSync(dir, { recursive: true });
  const old = readdirSync(dir)
    .filter((file) => file.startsWith(`${name}-`) && file.endsWith('.jsonl'))
    .sort();
  for (const file of old.slice(0, Math.max(0, old.length - LOGS_KEPT + 1))) rmSync(join(dir, file), { force: true });
  return join(dir, `${name}-${startedAt.toISOString().slice(0, 19).replaceAll(':', '-')}.jsonl`);
}

function phaseText(phase: Phase): string {
  if (phase.arrivalCount !== undefined) return `${phase.arrivalCount} VUs over ${phase.duration}s`;
  const rate = phase.arrivalRate ?? 0;
  if (phase.rampTo !== undefined && phase.rampTo !== rate) return `${rate} → ${phase.rampTo}/s over ${phase.duration}s`;
  return `${rate}/s for ${phase.duration}s`;
}

/**
 * Runs a scenario: arrivals in an open loop, a live line every interval, then the checks (the scenario's, then the
 * app's `afterRun`), the summary, a baseline comparison, and for a passing full run a new baseline entry. Every
 * interval and the summary go to a JSONL log.
 */
export async function runScenario(scenario: AnyScenario, options: RunOptions): Promise<RunResult> {
  const { name, target, dataDir, short = false, quiet = false } = options;
  const metrics = new Metrics();
  const output = options.output ?? process.stdout;
  const display = new LiveDisplay(Boolean(output.isTTY), output);
  const startedAt = new Date();
  const logFile = logFileFor(dataDir, name, startedAt);
  const log = (entry: object) => appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  const { events, phases, plannedS, pick } = plan(scenario, short);
  const declared = new Set<string>(scenario.counters ?? []);
  const primaryKey = scenario.primary ?? 'http.response_time.p95';
  const primaryName = primaryKey.slice(0, primaryKey.lastIndexOf('.'));
  const attachments: Record<string, unknown> = {};
  /** The first message of each error that failed a VU. */
  const errors: Record<string, { message: string }> = {};
  const showPhases = !(quiet && output.isTTY);

  const stop = new AbortController();
  const lag = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
  lag.enable();
  let lagP99Max = 0;
  let lagWarning: string | null = null;

  let phaseName = phases[0]?.name ?? '';
  let active = 0;
  let index = 0;
  let onIdle: (() => void) | null = null;
  const started = performance.now();
  let lastTick = started;

  const launch = () => {
    const { role, fn } = pick();
    const client = createHttpClient(target, metrics, stop.signal);
    const sockets: WebSocket[] = [];
    const resolveUrl = (url: string) => (/^[a-z]+:\/\//.test(url) ? url : `${target}${url}`);
    const vu: Vu<string, string> = {
      index: index++,
      role,
      short,
      signal: stop.signal,
      http: client,
      sse: (url, onEvent, sseOptions = {}) => readSse(resolveUrl(url), onEvent, sseOptions, metrics, stop.signal),
      ws: (url, protocols) =>
        new Promise((resolve, reject) => {
          const socket = new WebSocket(resolveUrl(url).replace(/^http/, 'ws'), protocols);
          sockets.push(socket);
          socket.addEventListener('open', () => resolve(socket), { once: true });
          socket.addEventListener('error', () => reject(Object.assign(new Error(`WebSocket ${url} did not open`), { code: 'EWEBSOCKET' })), {
            once: true,
          });
        }),
      think: (thinkMs) => delay(thinkMs, undefined, { signal: stop.signal }),
      counter: (counter, n) => metrics.counter(counter, n),
      histogram: (histogram, value) => metrics.histogram(histogram, value),
      log: (text) => display.log(text),
      attach: (key, data) => {
        attachments[key] = data;
      },
    };
    metrics.counter('vusers.created');
    active++;
    fn(vu)
      .then(
        () => metrics.counter('vusers.completed'),
        (error: unknown) => {
          metrics.counter('vusers.failed');
          const code = stop.signal.aborted ? 'aborted' : errorCode(error);
          if (!(error as { [COUNTED]?: boolean })?.[COUNTED] || stop.signal.aborted) metrics.counter(`errors.${code}`);
          errors[code] ??= { message: error instanceof Error ? error.message : String(error) };
        },
      )
      .finally(() => {
        client.close();
        for (const socket of sockets) socket.close();
        active--;
        if (active === 0) onIdle?.();
      });
  };

  const tick = () => {
    const now = performance.now();
    const intervalS = (now - lastTick) / 1000;
    lastTick = now;
    const { counters, histograms } = metrics.tick();
    const lagP99 = Math.max(0, lag.percentile(99) / 1e6 - LAG_RESOLUTION_MS);
    lag.reset();
    lagP99Max = Math.max(lagP99Max, lagP99);
    const elapsedS = (now - started) / 1000;
    if (lagP99 > LAG_WARN_MS && !lagWarning) {
      lagWarning = `generator event-loop lag p99 ${Math.round(lagP99)} ms (over ${LAG_WARN_MS} ms): the load generator is saturated, latencies include its own queueing`;
      display.log(`  ⚠ ${lagWarning}`);
    }
    const custom = Object.entries(counters).filter(([counter, n]) => declared.has(counter) && n > 0);
    const primary = primaryName.startsWith('http.') ? undefined : histograms[primaryName];
    const vus = {
      started: counters['vusers.created'] ?? 0,
      active,
      completed: metrics.get('vusers.completed'),
      failed: metrics.get('vusers.failed'),
    };
    log({ type: 'interval', t: Math.round(elapsedS * 10) / 10, phase: phaseName, vus, counters, histograms, lagP99Ms: lagP99 });
    display.render(
      liveLines({
        scenario: name,
        phase: phaseName,
        elapsedS,
        plannedS,
        vus,
        intervalS: Math.max(intervalS, 0.001),
        counters,
        http: histograms['http.response_time'],
        primary: primary && { name: primaryName, distribution: primary },
        custom,
        lagP99,
      }),
    );
  };

  if (!quiet) display.log(`${paint('dim', '▸')} running ${name}${short ? ' (short)' : ''}: ${scenario.description}`);
  const ticker = setInterval(tick, DEFAULT_INTERVAL_MS);

  await play(
    events,
    (event) => {
      if (event.kind === 'arrival') return launch();
      phaseName = phases[event.phase].name;
      if (showPhases && !scenario.run && !short) display.log(`  ${paint('dim', 'phase')} ${phaseName} · ${phaseText(phases[event.phase])}`);
    },
    stop.signal,
  );

  if (active > 0) {
    if (!scenario.run) phaseName = 'drain';
    const drainS = scenario.drainTimeout ?? (scenario.run ? Number.POSITIVE_INFINITY : DEFAULT_DRAIN_TIMEOUT_S);
    const idle = new Promise<void>((resolve) => (onIdle = resolve));
    const timedOut = Number.isFinite(drainS) ? delay(drainS * 1000).then(() => 'timeout' as const) : new Promise<never>(() => {});
    if ((await Promise.race([idle, timedOut])) === 'timeout') {
      display.log(`  ⚠ ${active} VUs still running after ${drainS} s: aborted`);
      stop.abort();
      await Promise.race([idle, delay(ABORT_GRACE_S * 1000)]);
    }
  }
  clearInterval(ticker);
  tick();
  lag.disable();
  const durationS = (performance.now() - started) / 1000;

  const counters = Object.fromEntries(metrics.counters);
  const distributions = Object.fromEntries(
    metrics.histogramNames().flatMap((histogram) => {
      const d = metrics.distribution(histogram);
      return d ? [[histogram, d]] : [];
    }),
  );
  const checks = evaluateChecks(scenario.checks ?? {}, { counters, distributions, short });
  if (options.afterRun) {
    display.render([`${name} ${paint('dim', '· checking what the app recorded')}`]);
    checks.push(...(await options.afterRun({ counters, checks: [...checks], short })));
  }
  display.clear();
  const ok = checks.every((check) => check.ok);

  const requests = metrics.get('http.requests');
  const http = distributions['http.response_time'] ?? null;
  const endpoints = metrics.endpointSummaries();
  const primaryStat = primaryKey.slice(primaryKey.lastIndexOf('.') + 1) as keyof Distribution;
  const current: BaselineEntry = {
    runner: RUNNER_EPOCH,
    timestamp: startedAt.toISOString(),
    scenario: name,
    requests,
    requestRate: Math.round((requests / durationS) * 10) / 10,
    mean: http?.mean ?? 0,
    p50: http?.p50 ?? 0,
    p95: http?.p95 ?? 0,
    p99: http?.p99 ?? 0,
    errors: Object.entries(counters).reduce((sum, [counter, n]) => (counter.startsWith('errors.') ? sum + n : sum), 0),
    vusersCreated: metrics.get('vusers.created'),
    vusersFailed: metrics.get('vusers.failed'),
    primary: { metric: primaryKey, value: distributions[primaryName]?.[primaryStat] ?? 0 },
    endpoints: Object.fromEntries(
      Object.entries(endpoints).map(([label, e]) => [
        label,
        { requests: e.requests, p50: e.ttfb.p50, p95: e.ttfb.p95, p99: e.ttfb.p99, nonOk: e.nonOk, timeouts: e.timeouts },
      ]),
    ),
  };

  const { baseline, older } = short ? { baseline: null, older: 0 } : loadBaseline(dataDir, name);
  const saved = !short && ok ? saveBaseline(dataDir, current, options.legacyBaselineFile) : null;

  const builtin = /^(vusers|http|errors)\./;
  const summary: RunSummary = {
    type: 'summary',
    runner: RUNNER_EPOCH,
    scenario: name,
    startedAt: startedAt.toISOString(),
    durationS,
    short,
    vus: { created: current.vusersCreated, completed: metrics.get('vusers.completed'), failed: current.vusersFailed },
    requests,
    requestRate: current.requestRate,
    http,
    endpoints,
    histograms: Object.fromEntries(Object.entries(distributions).filter(([histogram]) => !histogram.startsWith('http.'))),
    counters,
    errors: Object.fromEntries(
      Object.entries(counters).flatMap(([counter, n]) =>
        counter.startsWith('errors.') ? [[counter.slice(7), { count: n, message: errors[counter.slice(7)]?.message ?? '' }]] : [],
      ),
    ),
    checks,
    generatorLagP99MaxMs: lagP99Max,
    attachments,
  };
  log(summary);

  const view: SummaryView = {
    ...summary,
    http: http ?? undefined,
    counters: Object.entries(counters).filter(([counter]) => !builtin.test(counter)),
    compared: !short && ok,
    baseline,
    olderBaselines: older,
    current,
    saved,
    logFile,
    lagWarning,
  };
  if (quiet) display.log(compactLine(view));
  else for (const line of ['', ...summaryLines(view), '']) display.log(line);

  return { ok, summary, current, baseline: ok ? baseline : null, logFile };
}
