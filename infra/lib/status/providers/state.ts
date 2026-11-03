import { check, probed, runSetup, unlock } from '../check';
import type { ScalewayFacts, StatusProvider } from '../types';

/** The state bucket's presence and the lease, from the shared read. */
export const stateProvider: StatusProvider<ScalewayFacts> = {
  domain: 'state',
  gather(session) {
    return session.scalewayFacts();
  },
  evaluate(facts, session) {
    const creds = session.scalewayKeyAvailable;
    const bucket = check('state.bucket', 'State bucket', 'scaleway');
    const lock = check('state.lock', 'Lease', 'scaleway');
    return [
      probed(bucket, creds, facts?.stateBucketExists, 'could not read the state bucket', (exists) =>
        exists ? bucket.ok('present') : bucket.missing('absent; run setup to create it', runSetup),
      ),
      probed(lock, creds, facts?.lock, 'could not read the lease', (held) => {
        if (!held.held) return lock.ok('free');
        const who = `${held.owner ?? 'unknown'} (${held.operation ?? 'unknown op'})`;
        return held.stale
          ? lock.warn(`stale lease held by ${who}, expired ${held.expiresAt ?? '?'}`, unlock)
          : lock.warn(`held by ${who} since ${held.acquiredAt ?? '?'} (a run may be in progress)`);
      }),
    ];
  },
};
