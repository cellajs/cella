#!/usr/bin/env tsx
import process from 'node:process';
import pc from 'picocolors';
import { CDC_HEALTH_URL } from './config';

function parseArgs() {
  const args = process.argv.slice(2);
  let interval = 3;
  let duration = 0;
  let quiet = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) interval = Number.parseInt(args[++i], 10);
    if (args[i] === '--duration' && args[i + 1]) duration = Number.parseInt(args[++i], 10);
    if (args[i] === '--quiet') quiet = true;
  }

  return { interval, duration, quiet };
}

interface PollState {
  /** The previous sample's `eventsProcessed`: a rise means this run produced events. */
  prevEvents: number | null;
  /** Set at the first rise. Events of an earlier scenario stay in the worker's minute, and are no reason to report. */
  active: boolean;
  samples: { opsPerSec: number; eventsLastMinute: number; p95: number; walLag: number }[];
}

async function poll(state: PollState, quiet: boolean) {
  try {
    const res = await fetch(CDC_HEALTH_URL);
    if (!res.ok) return;

    // The worker's metrics cover a rolling minute: `eventsProcessed` is the events in it, not a running total, and
    // `throughput` is their rate. A difference of two `eventsProcessed` samples drops whatever aged out between them.
    const body = (await res.json()) as {
      metrics?: {
        eventsProcessed: number;
        throughput?: number;
        processingLatency?: { p95?: number };
        walLagBytes?: number;
        batchSize?: { avg?: number };
      };
    };
    const m = body.metrics;
    if (!m) return;

    const opsPerSec = m.throughput ?? 0;
    const eventsLastMinute = m.eventsProcessed;
    const p95 = m.processingLatency?.p95 ?? 0;
    const walLag = m.walLagBytes ?? 0;
    const batchAvg = m.batchSize?.avg ?? 0;

    if (state.prevEvents !== null && eventsLastMinute > state.prevEvents) state.active = true;
    state.prevEvents = eventsLastMinute;
    if (state.active) state.samples.push({ opsPerSec, eventsLastMinute, p95, walLag });

    if (quiet) return;

    console.info(
      `${pc.cyan('CDC')} ${pc.bold(String(opsPerSec))} ops/s | ` +
        `p95=${pc.yellow(String(p95))}ms | ` +
        `events/min=${eventsLastMinute} | ` +
        `lag=${walLag}B | ` +
        `batch=${batchAvg}`,
    );
  } catch {
    // The CDC worker may not be running yet.
  }
}

function printSummary(samples: PollState['samples']) {
  if (samples.length === 0) return;

  const throughputs = samples.map((s) => s.opsPerSec).filter((v) => v > 0);
  const p95s = samples.map((s) => s.p95).filter((v) => v > 0);

  if (throughputs.length === 0) return;

  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const max = (arr: number[]) => Math.max(...arr);

  console.info(`\n${pc.cyan('CDC Summary')}`);
  console.info(`  Throughput (rolling minute): avg=${avg(throughputs)} ops/s, peak=${max(throughputs)} ops/s`);
  console.info(`  Events in one minute: peak=${max(samples.map((s) => s.eventsLastMinute))}`);
  console.info(`  p95 latency: avg=${avg(p95s)}ms, max=${max(p95s)}ms`);
  console.info(`  Samples: ${samples.length}`);
}

/**
 * Polls the CDC worker's /health endpoint during a run for throughput (ops/s), p95 latency, WAL lag, and event counts. Bench starts it in the background with `--quiet`, silent unless CDC processed events. Standalone for live per-interval logging:
 *
 *   tsx src/cdc-poller.ts [--interval 3] [--duration 120] [--quiet]
 */
async function main() {
  const { interval, duration, quiet } = parseArgs();
  const state: PollState = { prevEvents: null, active: false, samples: [] };

  if (!quiet) {
    const limit = duration > 0 ? ` for ${duration}s` : '';
    console.info(`${pc.cyan('⧈ CDC poller')} polling ${CDC_HEALTH_URL} every ${interval}s${limit}`);
  }

  const timer = setInterval(() => poll(state, quiet), interval * 1000);

  if (duration > 0) {
    setTimeout(() => {
      clearInterval(timer);
      printSummary(state.samples);
    }, duration * 1000);
  } else {
    process.on('SIGINT', () => {
      clearInterval(timer);
      printSummary(state.samples);
      process.exit(0);
    });
  }
}

main();
