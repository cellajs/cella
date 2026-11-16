import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { PROPAGATION } from '../config';
import { PROPAGATION_COUNTERS, PROPAGATION_HISTOGRAMS, runPropagation } from '../sync/propagation';

/** `edit-propagation` without its pauses, while background writers edit other rows at `PROPAGATION_LOAD` edits per second. */
export default defineScenario({
  description: 'Busy edit propagation: how late an edit reaches a reader while others write.',
  counters: PROPAGATION_COUNTERS,
  histograms: PROPAGATION_HISTOGRAMS,
  primary: 'sync.visible_ms.p95',
  checks: { maxErrorShare: 0, expect: ['sync.range_fetches'], forbid: ['sync.lost', 'bench.rows_diverged', 'sse.errors'] },
  run: (vu) => runPropagation(vu, attachmentProduct, { ...PROPAGATION, gapMs: 0 }),
});
