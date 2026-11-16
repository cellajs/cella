import { defineScenario } from '@cellajs/cli/bench';
import { attachmentProduct } from '../attachment-requests';
import { REVOCATION_COUNTERS, REVOCATION_HISTOGRAMS, runRevocation } from '../sync/revocation';

/**
 * `sync/revocation.ts` drives it. The target's refused reads are among the run's few responses, hence the rejected
 * share. `sync.kept_in_tolerance` counts a kept answer the target still took with its range key while the key lived.
 */
export default defineScenario({
  description: 'Access revocation: a removed member stops hearing and reading the organization while others write.',
  counters: REVOCATION_COUNTERS,
  histograms: REVOCATION_HISTOGRAMS,
  primary: 'sync.revoke_signal_ms.p95',
  checks: {
    maxErrorShare: 0,
    maxRejectedShare: 20,
    expect: ['sync.bystander_frames'],
    forbid: ['sync.frames_after_revoke', 'sync.reads_after_revoke', 'sync.revoke_unheard', 'sse.errors'],
  },
  run: (vu) => runRevocation(vu, attachmentProduct),
});
