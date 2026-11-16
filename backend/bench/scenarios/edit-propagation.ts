import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { PROPAGATION } from '../config';
import { PROPAGATION_COUNTERS, PROPAGATION_HISTOGRAMS, runPropagation } from '../sync/propagation';

/** `sync/propagation.ts` drives it; `PROPAGATION_EDITS`, `PROPAGATION_WARMUPS` and `PROPAGATION_GAP_MS` in `config.ts` shape it. */
export default defineScenario({
  description: 'Edit propagation: how long until a reader viewing the channel holds an edit, with the stack at rest.',
  counters: PROPAGATION_COUNTERS,
  histograms: PROPAGATION_HISTOGRAMS,
  primary: 'sync.visible_ms.p95',
  checks: { maxErrorShare: 0, expect: ['sync.range_fetches'], forbid: ['sync.lost', 'bench.rows_diverged', 'sse.errors'] },
  run: (vu) => runPropagation(vu, attachmentProduct, { ...PROPAGATION, loadPerSecond: 0 }),
});
