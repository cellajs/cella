import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { REPLAY } from '../config';
import { REPLAY_COUNTERS, REPLAY_HISTOGRAMS, runReplay } from '../sync/replay';

/**
 * `sync/replay.ts` drives it; `REPLAY_SIZES` in `config.ts` lists the queue sizes. With `--rtt` the drain shows what
 * one round trip per replayed write costs a user.
 */
export default defineScenario({
  description: 'Offline replay: a queue of offline edits merges by last writer wins and drains one write at a time.',
  counters: REPLAY_COUNTERS,
  histograms: REPLAY_HISTOGRAMS,
  primary: 'sync.replay_write_ms.p95',
  checks: {
    maxErrorShare: 0,
    expect: ['sync.range_fetches'],
    forbid: ['sync.lww_violations', 'sync.replay_refused', 'bench.rows_diverged', 'sse.errors'],
  },
  run: (vu) => runReplay(vu, attachmentProduct, REPLAY),
});
