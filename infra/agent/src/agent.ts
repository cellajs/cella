import { errorMessage } from '../../lib/utils/errors';
import type { AgentState } from './health';
import type { Manifest } from './manifest';

/** How often the agent reads its manifest: a drain order shows up within about three seconds of the deploy's write. */
export const MANIFEST_POLL_MS = 2_000;

/** What the agent does outside this module, so a test passes its own. */
export interface AgentEffects {
  /** The boot sequence: the env file, the archives, `compose up --wait`, the boot account. Throws when the release did not start. */
  boot(): Promise<void>;
  readManifest(): Promise<Manifest>;
  /** Stop the machine's app containers through Compose, which sends each its stop signal and waits its grace period. */
  stopServices(): Promise<void>;
  /** Serve the health ports, answering from the state given. */
  serve(state: () => AgentState): void;
  sleep(ms: number): Promise<void>;
  log(step: string, fields?: Record<string, string | number | boolean>): void;
}

/**
 * The agent's life on a machine. It answers the load balancer at once, 503 until the release booted. A manifest that already says drain,
 * as after a reboot of a drained machine, starts nothing. It then reads the manifest every two seconds: on `drain` it answers 503, waits the
 * role's drain seconds while the load balancer lets connections finish, and stops the app containers. A boot that failed leaves it
 * answering 503 until the deploy deletes the machine. Resolves once it drained, or after `rounds` reads in a test; the health ports keep
 * the process alive until the machine goes.
 */
export async function runAgent(fx: AgentEffects, opts: { drainSeconds: number; pollMs?: number; rounds?: number }): Promise<AgentState> {
  const state: AgentState = { booted: false, draining: false };
  fx.serve(() => state);
  const read = () =>
    fx.readManifest().catch((error: unknown) => {
      fx.log('manifest-unread', { message: errorMessage(error) });
      return undefined;
    });
  const drain = async () => {
    state.draining = true;
    fx.log('drain', { seconds: opts.drainSeconds });
    await fx.sleep(opts.drainSeconds * 1000);
    await fx.stopServices().catch((error: unknown) => fx.log('stop-failed', { message: errorMessage(error) }));
    fx.log('drained');
  };
  if ((await read())?.drain) {
    await drain();
    return state;
  }
  const booting = fx.boot().then(
    () => {
      state.booted = true;
      fx.log('serving');
    },
    (error: unknown) => fx.log('boot-failed', { message: errorMessage(error) }),
  );
  for (let round = 0; opts.rounds === undefined || round < opts.rounds; round++) {
    await fx.sleep(opts.pollMs ?? MANIFEST_POLL_MS);
    if ((await read())?.drain) {
      await drain();
      break;
    }
  }
  await booting;
  return state;
}
