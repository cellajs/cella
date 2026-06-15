#!/usr/bin/env tsx
/**
 * CDC Health Poller — standalone metrics collector.
 *
 * Polls the CDC worker's /health endpoint during load tests and logs
 * throughput (ops/s), p95 latency, WAL lag, and event counts.
 *
 * Usage: tsx src/cdc-poller.ts [--interval 3] [--duration 120]
 */
import pc from 'picocolors';

const CDC_HEALTH_URL = process.env.CDC_HEALTH_URL || 'http://localhost:4001/health?depth=full';

function parseArgs() {
  const args = process.argv.slice(2);
  let interval = 3;
  let duration = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) interval = Number.parseInt(args[++i], 10);
    if (args[i] === '--duration' && args[i + 1]) duration = Number.parseInt(args[++i], 10);
  }

  return { interval, duration };
}

interface PollState {
  prevEvents: number;
  prevTime: number;
  samples: { opsPerSec: number; p95: number; walLag: number }[];
}

async function poll(state: PollState) {
  try {
    const res = await fetch(CDC_HEALTH_URL);
    if (!res.ok) return;

    const body = (await res.json()) as {
      metrics?: {
        eventsProcessed: number;
        processingLatency?: { p95?: number };
        walLagBytes?: number;
        batchSize?: { avg?: number };
      };
    };
    const m = body.metrics;
    if (!m) return;

    const now = Date.now();
    const totalEvents = m.eventsProcessed;

    let opsPerSec = 0;
    if (state.prevTime > 0 && totalEvents > state.prevEvents) {
      const dt = (now - state.prevTime) / 1000;
      opsPerSec = Math.round((totalEvents - state.prevEvents) / dt);
    }
    state.prevEvents = totalEvents;
    state.prevTime = now;

    const p95 = m.processingLatency?.p95 ?? 0;
    const walLag = m.walLagBytes ?? 0;
    const batchAvg = m.batchSize?.avg ?? 0;

    state.samples.push({ opsPerSec, p95, walLag });

    console.info(
      `${pc.cyan('CDC')} ${pc.bold(String(opsPerSec))} ops/s | ` +
        `p95=${pc.yellow(String(p95))}ms | ` +
        `events=${totalEvents} | ` +
        `lag=${walLag}B | ` +
        `batch=${batchAvg}`,
    );
  } catch {
    // Non-critical — CDC worker may not be running yet
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
  console.info(`  Throughput: avg=${avg(throughputs)} ops/s, peak=${max(throughputs)} ops/s`);
  console.info(`  p95 latency: avg=${avg(p95s)}ms, max=${max(p95s)}ms`);
  console.info(`  Samples: ${samples.length}`);
}

async function main() {
  const { interval, duration } = parseArgs();
  const state: PollState = { prevEvents: 0, prevTime: 0, samples: [] };

  console.info(
    `${pc.cyan('⧈ CDC poller')} polling ${CDC_HEALTH_URL} every ${interval}s` +
      (duration > 0 ? ` for ${duration}s` : ''),
  );

  const timer = setInterval(() => poll(state), interval * 1000);

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
