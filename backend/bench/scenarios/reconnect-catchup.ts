import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { CATCHUP } from '../config';
import { CATCHUP_COUNTERS, CATCHUP_HISTOGRAMS, runCatchup } from '../sync/catchup';

/**
 * `sync/catchup.ts` drives it; `CATCHUP_CLIENTS`, `CATCHUP_EDITS` and `CATCHUP_MODE` in `config.ts` shape it.
 * `CATCHUP_MODE=spread` reads each gap in the client's slot of the server's spread window, as users see it.
 */
export default defineScenario({
  description: 'Reconnect catchup: every stream ends at once, as on a deploy, and every client catches up together.',
  counters: CATCHUP_COUNTERS,
  histograms: CATCHUP_HISTOGRAMS,
  primary: 'sync.caught_up_ms.p95',
  checks: {
    maxErrorShare: 0,
    expect: ['sync.range_fetches'],
    forbid: ['sync.not_caught_up', 'sync.heard_while_away', 'bench.rows_diverged', 'sse.errors'],
  },
  run: (vu) => runCatchup(vu, attachmentProduct, CATCHUP),
});
