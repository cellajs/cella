import { check, deployAction, probed, runSetup, unlock } from '../check';
import type { ScalewayFacts, StatusProvider } from '../types';

/** First 7 chars of a git SHA, the length humans and logs use. */
const short = (sha: string): string => sha.slice(0, 7);

/** State-bucket, stack-lock, and rollout checks from the shared control read. */
export const stateProvider: StatusProvider<ScalewayFacts> = {
  domain: 'state',
  gather(session) {
    return session.scalewayFacts();
  },
  evaluate(facts, session) {
    const creds = session.credentialsAvailable;
    const bucket = check('state.bucket', 'State bucket', 'scaleway');
    const lock = check('state.lock', 'Stack lock', 'scaleway');
    const rollout = check('rollout', 'Rollout', 'scaleway');
    return [
      probed(bucket, creds, facts?.stateBucketExists, 'could not read the state bucket', (exists) =>
        exists ? bucket.ok('present') : bucket.missing('absent; run setup to create it', runSetup),
      ),
      probed(lock, creds, facts?.lock, 'could not read the lock object', (held) => {
        if (!held.held) return lock.ok('unlocked');
        const who = `${held.owner ?? 'unknown'} (${held.operation ?? 'unknown op'})`;
        return held.stale
          ? lock.warn(`stale lock held by ${who}, expired ${held.expiresAt ?? '?'}`, unlock)
          : lock.warn(`locked by ${who} since ${held.acquiredAt ?? '?'} (a run may be in progress)`);
      }),
      probed(rollout, creds, facts?.rollout, 'could not read the control object', (services) => {
        if (services.length === 0) return rollout.missing('no services deployed yet', deployAction(session.mode));
        if (!services.some((r) => r.activeSha))
          return rollout.missing('no active generation for any service', deployAction(session.mode));
        const summary = services
          .map(
            (r) =>
              `${r.slug}=${r.activeSha ? short(r.activeSha) : '-'}${r.pendingSha ? `→${short(r.pendingSha)}` : ''}`,
          )
          .join(' ');
        return services.some((r) => r.pendingSha)
          ? rollout.warn(`pending rollout: ${summary}`, deployAction(session.mode))
          : rollout.ok(summary);
      }),
    ];
  },
};
