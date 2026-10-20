import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineScenario, runScenario } from '../runner';
import { baselineFile } from '../runner/baseline';

let server: Server;
let target = '';
const dataDir = mkdtempSync(join(tmpdir(), 'bench-run-'));
/** Swallows the live display and the summary. */
const output = Object.assign(new Writable({ write: (_chunk, _encoding, done) => done() }), { isTTY: false }) as unknown as NodeJS.WriteStream;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') return setTimeout(() => res.end('ok'), 2);
    if (req.url === '/denied') {
      res.statusCode = 401;
      return res.end();
    }
    if (req.url === '/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('event: change\ndata: {"seq":1}\n\n');
      return setTimeout(() => res.end('event: change\ndata: {"seq":2}\n\n'), 20);
    }
    // `/hang` never answers.
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('runScenario', () => {
  it('starts every VU of the phases, times every request and saves a passing run as the baseline', async () => {
    const scenario = defineScenario({
      description: 'two requests per VU',
      phases: [{ name: 'hold', duration: 1, arrivalRate: 10 }],
      counters: ['loops'],
      checks: { maxErrorRate: 0, thresholds: { 'http.response_time.p95': 1000 }, expect: ['loops'] },
      async vu(vu) {
        for (let i = 0; i < 2; i++) {
          await vu.http.get('/ok', { name: 'GET /ok' });
          vu.counter('loops');
        }
      },
    });
    const result = await runScenario(scenario, { name: 'ok', target, dataDir, output });

    expect(result.ok).toBe(true);
    expect(result.summary.vus).toEqual({ created: 10, completed: 10, failed: 0 });
    expect(result.summary.requests).toBe(20);
    expect(result.summary.endpoints['GET /ok']).toMatchObject({ requests: 20, codes: { 200: 20 }, nonOk: 0, timeouts: 0 });
    expect(result.summary.counters.loops).toBe(20);
    expect(result.current.p50).toBeGreaterThan(0);
    expect(existsSync(baselineFile(dataDir, 'ok'))).toBe(true);
    const lines = readFileSync(result.logFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string });
    expect(lines.at(-1)?.type).toBe('summary');
    expect(lines.some((line) => line.type === 'interval')).toBe(true);
  });

  it('fails a VU on a timeout, counts it once, and fails the error-rate and response checks', async () => {
    const scenario = defineScenario({
      description: 'one timeout, one 401',
      phases: [{ name: 'one', duration: 1, arrivalCount: 1 }],
      checks: { maxErrorRate: 0 },
      async vu(vu) {
        await vu.http.get('/denied');
        await vu.http.get('/hang', { timeout: 100 });
      },
    });
    const result = await runScenario(scenario, { name: 'failing', target, dataDir, output });

    expect(result.ok).toBe(false);
    expect(result.summary.counters['errors.ETIMEDOUT']).toBe(1);
    expect(result.summary.endpoints['GET /hang']).toMatchObject({ requests: 1, timeouts: 1 });
    expect(result.summary.vus).toEqual({ created: 1, completed: 0, failed: 1 });
    expect(result.summary.checks.filter((check) => !check.ok).map((check) => check.id)).toEqual(['responses', 'errorRate']);
    expect(existsSync(baselineFile(dataDir, 'failing'))).toBe(false);
  });

  it('plays each role once in a short run, reads streams, and adds the app checks', async () => {
    const seen: string[] = [];
    const scenario = defineScenario({
      description: 'roles and a stream',
      phases: [{ name: 'many', duration: 5, arrivalRate: 100 }],
      roles: [
        { name: 'listener', weight: 9, vu: async (vu) => void (await vu.sse('/stream', ({ data }) => seen.push(data))) },
        { name: 'caller', weight: 1, vu: async (vu) => void (await vu.http.get('/ok')) },
      ],
    });
    const result = await runScenario(scenario, {
      name: 'short',
      target,
      dataDir,
      output,
      short: true,
      afterRun: async ({ counters }) => [{ id: 'app', ok: counters['http.requests'] === 2, text: 'two requests' }],
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual(['{"seq":1}', '{"seq":2}']);
    expect(result.summary.vus.created).toBe(2);
    expect(Object.keys(result.summary.endpoints).sort()).toEqual(['GET /ok', 'SSE /stream']);
    expect(result.summary.checks.at(-1)).toEqual({ id: 'app', ok: true, text: 'two requests' });
    expect(existsSync(baselineFile(dataDir, 'short'))).toBe(false);
  });
});
