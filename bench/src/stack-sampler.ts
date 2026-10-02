import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);

/** A stack process, found by the TCP port it listens on. */
interface ProcessTarget {
  name: string;
  port: number;
}

/** pg_stat counters of the bench database at one moment; differences between two give the database's work. */
export interface DbCounters {
  at: number;
  commits: number;
  rollbacks: number;
  inserted: number;
  updated: number;
  deleted: number;
  fetched: number;
  walLsn: string;
  tables: Record<string, { ins: number; upd: number; del: number; scans: number }>;
}

interface ProcessSummary {
  name: string;
  pid: number | null;
  cpuMeanPct: number;
  cpuMaxPct: number;
  rssMaxMb: number;
  /** Most connections the process held to the database at once. */
  dbConnectionsMax: number;
}

export interface WindowSummary {
  processes: ProcessSummary[];
  dbContainer: { name: string; cpuMeanPct: number; cpuMaxPct: number; memMaxMb: number } | null;
  dbSessions: { totalMax: number; activeMean: number; lockWaitMean: number; lockWaitMax: number; listeners: number };
  /** Share of sampled active backends per `wait_event_type:wait_event`, `CPU` for none. */
  waitProfile: Record<string, number>;
}

interface Timed<T> {
  at: number;
  value: T;
}

const SAMPLE_TABLES = ['yjs_updates', 'yjs_documents', 'attachments', 'activities', 'rate_limits'];

async function pidOnPort(port: number): Promise<number | null> {
  try {
    const { stdout } = await run('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN']);
    const pid = Number(stdout.trim().split('\n')[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** `ps` cumulative CPU time, `[dd-][hh:]mm:ss.cc`, in seconds. */
function cpuSeconds(time: string): number {
  let rest = time.trim();
  let days = 0;
  const dash = rest.indexOf('-');
  if (dash >= 0) {
    days = Number(rest.slice(0, dash));
    rest = rest.slice(dash + 1);
  }
  return days * 86_400 + rest.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** The container publishing the database port, for `docker stats`; null without docker or a match. */
async function dbContainerName(dbUrl: string): Promise<string | null> {
  const port = new URL(dbUrl).port || '5432';
  try {
    const { stdout } = await run('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}']);
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

/** Docker's `12.5MiB` style sizes, in MB. */
function megabytes(size: string): number {
  const match = /([\d.]+)\s*([KMG]i?B|B)/i.exec(size);
  if (!match) return 0;
  const factor: Record<string, number> = { b: 1 / 1_048_576, kib: 1 / 1024, kb: 1 / 1024, mib: 1, mb: 1, gib: 1024, gb: 1024 };
  return Number(match[1]) * (factor[match[2].toLowerCase()] ?? 1);
}

async function readDbCounters(pool: pg.Pool): Promise<DbCounters> {
  const { rows } = await pool.query(
    `SELECT d.xact_commit, d.xact_rollback, d.tup_inserted, d.tup_updated, d.tup_deleted, d.tup_fetched, pg_current_wal_lsn()::text AS lsn,
       (SELECT json_object_agg(rel, json_build_object('ins', ins, 'upd', upd, 'del', del, 'scans', scans)) FROM (
          SELECT CASE WHEN relname LIKE 'activities%' THEN 'activities' ELSE relname END AS rel,
                 sum(n_tup_ins) AS ins, sum(n_tup_upd) AS upd, sum(n_tup_del) AS del, sum(seq_scan + coalesce(idx_scan, 0)) AS scans
          FROM pg_stat_user_tables WHERE relname = ANY($1) OR relname LIKE 'activities%' GROUP BY 1) t) AS tables
     FROM pg_stat_database d WHERE d.datname = current_database()`,
    [SAMPLE_TABLES],
  );
  const row = rows[0];
  return {
    at: Date.now(),
    commits: Number(row.xact_commit),
    rollbacks: Number(row.xact_rollback),
    inserted: Number(row.tup_inserted),
    updated: Number(row.tup_updated),
    deleted: Number(row.tup_deleted),
    fetched: Number(row.tup_fetched),
    walLsn: row.lsn,
    tables: Object.fromEntries(
      Object.entries((row.tables ?? {}) as Record<string, Record<string, number>>).map(([name, t]) => [
        name,
        { ins: Number(t.ins), upd: Number(t.upd), del: Number(t.del), scans: Number(t.scans) },
      ]),
    ),
  };
}

export async function walBytesBetween(pool: pg.Pool, from: DbCounters, to: DbCounters): Promise<number> {
  const { rows } = await pool.query('SELECT pg_wal_lsn_diff($1, $2) AS bytes', [to.walLsn, from.walLsn]);
  return Number(rows[0].bytes);
}

const mean = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
const max = (values: number[]) => values.reduce((a, b) => Math.max(a, b), 0);

/**
 * Samples the running stack while a scenario runs: CPU and RSS of each process (by the port it listens on), the
 * database connections each holds, the database container's CPU, and pg_stat_activity's sessions and wait events.
 * Every source is optional: without lsof, docker or a target's process, its numbers stay empty.
 */
export async function startStackSampler(targets: ProcessTarget[], dbUrl: string) {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  const pids = await Promise.all(targets.map((t) => pidOnPort(t.port)));
  const dbPort = new URL(dbUrl).port || '5432';
  const container = await dbContainerName(dbUrl);

  const cpu: Timed<{ pct: (number | null)[]; rssMb: (number | null)[] }>[] = [];
  const conns: Timed<number[]>[] = [];
  const docker: Timed<{ cpuPct: number; memMb: number }>[] = [];
  const sessions: Timed<{ total: number; active: number; lockWaits: number; listeners: number; waits: string[] }>[] = [];

  let stopped = false;
  let lastCpu: { at: number; seconds: (number | null)[] } | null = null;
  const livePids = pids.filter((pid): pid is number => pid !== null);

  const sampleProcesses = async () => {
    if (livePids.length === 0) return;
    const { stdout } = await run('ps', ['-o', 'pid=,time=,rss=', '-p', livePids.join(',')]).catch(() => ({ stdout: '' }));
    const byPid = new Map<number, { seconds: number; rssMb: number }>();
    for (const line of stdout.trim().split('\n')) {
      const [pid, time, rss] = line.trim().split(/\s+/);
      if (pid) byPid.set(Number(pid), { seconds: cpuSeconds(time), rssMb: Number(rss) / 1024 });
    }
    const at = Date.now();
    const seconds = pids.map((pid) => (pid === null ? null : (byPid.get(pid)?.seconds ?? null)));
    if (lastCpu) {
      const wall = (at - lastCpu.at) / 1000;
      const prev = lastCpu.seconds;
      cpu.push({
        at,
        value: {
          pct: seconds.map((s, i) => (s === null || prev[i] === null ? null : (100 * (s - (prev[i] as number))) / wall)),
          rssMb: pids.map((pid) => (pid === null ? null : (byPid.get(pid)?.rssMb ?? null))),
        },
      });
    }
    lastCpu = { at, seconds };
  };

  const sampleConnections = async () => {
    if (livePids.length === 0) return;
    const { stdout } = await run('lsof', ['-nP', '-a', '-p', livePids.join(','), `-iTCP:${dbPort}`, '-sTCP:ESTABLISHED']).catch(() => ({
      stdout: '',
    }));
    const counts = pids.map(() => 0);
    for (const line of stdout.split('\n').slice(1)) {
      const index = pids.indexOf(Number(line.trim().split(/\s+/)[1]));
      if (index >= 0) counts[index]++;
    }
    conns.push({ at: Date.now(), value: counts });
  };

  const sampleDocker = async () => {
    if (!container) return;
    const { stdout } = await run('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}', container]).catch(() => ({
      stdout: '',
    }));
    const [cpuPct, mem] = stdout.trim().split('|');
    if (cpuPct) docker.push({ at: Date.now(), value: { cpuPct: Number.parseFloat(cpuPct), memMb: megabytes(mem ?? '') } });
  };

  const sampleSessions = async () => {
    const { rows } = await pool.query(
      `SELECT state, wait_event_type, wait_event, application_name FROM pg_stat_activity
       WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()`,
    );
    const active = rows.filter((r) => r.state === 'active');
    sessions.push({
      at: Date.now(),
      value: {
        total: rows.length,
        active: active.length,
        lockWaits: active.filter((r) => r.wait_event_type === 'Lock').length,
        listeners: rows.filter((r) => String(r.application_name ?? '').startsWith('yjs-log-listener')).length,
        waits: active.map((r) => (r.wait_event_type ? `${r.wait_event_type}:${r.wait_event}` : 'CPU')),
      },
    });
  };

  /** Runs `fn` every `ms` until stopped, never overlapping itself. */
  const loop = (ms: number, fn: () => Promise<void>) =>
    (async () => {
      while (!stopped) {
        const started = Date.now();
        await fn().catch(() => undefined);
        await new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - started))));
      }
    })();

  const loops = [loop(2000, sampleProcesses), loop(5000, sampleConnections), loop(3000, sampleDocker), loop(500, sampleSessions)];

  /** Summarizes the samples taken between `from` and `to` (epoch ms). */
  const summarize = (from: number, to: number): WindowSummary => {
    const inWindow = <T>(samples: Timed<T>[]) => samples.filter((s) => s.at >= from && s.at <= to).map((s) => s.value);
    const cpuWin = inWindow(cpu);
    const connWin = inWindow(conns);
    const sessWin = inWindow(sessions);
    const dockerWin = inWindow(docker);
    const waits: Record<string, number> = {};
    let waitTotal = 0;
    for (const s of sessWin)
      for (const w of s.waits) {
        waits[w] = (waits[w] ?? 0) + 1;
        waitTotal++;
      }
    return {
      processes: targets.map((t, i) => {
        const pcts = cpuWin.map((s) => s.pct[i]).filter((v): v is number => v !== null);
        const rss = cpuWin.map((s) => s.rssMb[i]).filter((v): v is number => v !== null);
        return {
          name: t.name,
          pid: pids[i],
          cpuMeanPct: mean(pcts),
          cpuMaxPct: max(pcts),
          rssMaxMb: max(rss),
          dbConnectionsMax: max(connWin.map((c) => c[i])),
        };
      }),
      dbContainer: container
        ? {
            name: container,
            cpuMeanPct: mean(dockerWin.map((d) => d.cpuPct)),
            cpuMaxPct: max(dockerWin.map((d) => d.cpuPct)),
            memMaxMb: max(dockerWin.map((d) => d.memMb)),
          }
        : null,
      dbSessions: {
        totalMax: max(sessWin.map((s) => s.total)),
        activeMean: mean(sessWin.map((s) => s.active)),
        lockWaitMean: mean(sessWin.map((s) => s.lockWaits)),
        lockWaitMax: max(sessWin.map((s) => s.lockWaits)),
        listeners: max(sessWin.map((s) => s.listeners)),
      },
      waitProfile: Object.fromEntries(
        Object.entries(waits)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [k, v / waitTotal]),
      ),
    };
  };

  return {
    pool,
    counters: () => readDbCounters(pool),
    summarize,
    async stop() {
      stopped = true;
      await Promise.all(loops);
      await pool.end();
    },
  };
}
