import { defineScenario } from '../src/runner';
import { formatYjsTypingReport, runYjsTyping, YJS_HISTOGRAMS, yjsTypingOptions } from '../src/yjs-typing';

const sumOf = (counters: Record<string, number>, prefix: string) =>
  Object.entries(counters).reduce((sum, [name, n]) => (name.startsWith(prefix) ? sum + n : sum), 0);

/**
 * One run drives real y-websocket clients (`src/yjs-typing.ts`), shaped by the `YJS_*` variables in the bench README.
 * The driver's full report prints at the end and goes to the log under `yjs-typing`.
 */
export default defineScenario({
  description: 'Yjs typing: documents x typing clients on the relay; peer and Saved latency, pg_notify, materializations, fan-out.',
  counters: [
    'yjs.keystrokes',
    'yjs.notifications',
    'yjs.materializations',
    'yjs.sse_changes',
    'yjs.unsaved_frames',
    'yjs.docs_not_persisted',
    'yjs.docs_diverged',
    'yjs.closes',
    'yjs.connection_errors',
    'yjs.sse_errors',
    'yjs.reconnects',
  ],
  histograms: YJS_HISTOGRAMS,
  primary: 'yjs.peer_latency_ms.p95',
  checks: {
    maxErrorRate: 0,
    expect: ['yjs.keystrokes', 'yjs.materializations'],
    forbid: ['yjs.unsaved_frames', 'yjs.docs_not_persisted', 'yjs.docs_diverged'],
  },
  async run(ctx) {
    const report = await runYjsTyping(yjsTypingOptions(ctx.short), {
      histogram: (name, ms) => ctx.histogram(name, ms),
      keystroke: () => ctx.counter('yjs.keystrokes'),
    });
    ctx.counter('yjs.notifications', report.notify.total);
    ctx.counter('yjs.materializations', report.materialize.total);
    ctx.counter('yjs.sse_changes', report.sse.total);
    ctx.counter('yjs.unsaved_frames', report.end.unsavedFrames ?? 0);
    ctx.counter('yjs.docs_not_persisted', report.end.docsNotPersisted);
    ctx.counter('yjs.docs_diverged', report.end.docsDiverged);
    ctx.counter('yjs.closes', sumOf(report.counters, 'yjs.close.'));
    ctx.counter('yjs.connection_errors', sumOf(report.counters, 'yjs.connection_error'));
    ctx.counter('yjs.sse_errors', sumOf(report.counters, 'sse.error'));
    ctx.counter('yjs.reconnects', report.counters['yjs.reconnects'] ?? 0);
    ctx.log(formatYjsTypingReport(report));
    ctx.attach('yjs-typing', report);
  },
});
