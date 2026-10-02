import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { YjsTypingReport, YjsTypingSamples } from '../yjs-typing';

interface ArtilleryEvents {
  emit(kind: 'counter' | 'histogram', name: string, value: number): void;
}

/**
 * The whole yjs-typing workload in one VU. Artillery's websocket engine cannot speak the Yjs protocol, and it bundles
 * processors as ESM, where CommonJS packages such as pg and ws cannot require Node builtins: so the driver runs as its
 * own process, prints its report, and its samples and counts become Artillery metrics here.
 */
export async function typeTogether(_context: unknown, events: ArtilleryEvents): Promise<void> {
  const out = join(tmpdir(), `yjs-typing-${Date.now()}.json`);
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn('tsx', ['src/yjs-typing.ts', '--out', out, '--samples'], { stdio: 'inherit' });
    child.on('close', resolve);
    child.on('error', () => resolve(null));
  });
  if (code !== 0) throw new Error(`yjs-typing driver exited with ${code}`);

  const report = JSON.parse(readFileSync(out, 'utf8')) as YjsTypingReport & { samples: YjsTypingSamples };
  rmSync(out, { force: true });
  for (const value of report.samples.peerMs) events.emit('histogram', 'yjs.peer_latency_ms', value);
  for (const value of report.samples.savedMs) events.emit('histogram', 'yjs.saved_latency_ms', value);
  for (const value of report.samples.notifyDelayMs) events.emit('histogram', 'yjs.notify_delay_ms', value);
  events.emit('counter', 'yjs.keystrokes', report.keystrokes);
  events.emit('counter', 'yjs.notifications', report.notify.total);
  events.emit('counter', 'yjs.materializations', report.materialize.total);
  events.emit('counter', 'yjs.sse_notifications', report.sse.total);
  events.emit('counter', 'yjs.unsaved_frames', report.end.unsavedFrames ?? 0);
  events.emit('counter', 'yjs.docs_not_persisted', report.end.docsNotPersisted);
  for (const [name, value] of Object.entries(report.counters)) {
    if (name.includes('close') || name.includes('error') || name.includes('reconnect')) events.emit('counter', name, value);
  }
}
