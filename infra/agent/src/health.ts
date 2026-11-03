import { createServer, type Server } from 'node:http';
import { healthContract } from '../../config/health.config';
import type { AgentPort } from './plan';

/** Where the agent stands: booted once the release started, draining once its manifest said so. */
export interface AgentState {
  booted: boolean;
  draining: boolean;
}

/** One answer of a service's own `/health`; `status` 0 when it did not answer. */
export interface ServiceProbe {
  status: number;
  version?: string;
}

/** Ceiling on the agent's own probe: below the load balancer's 1 s check timeout, so a slow service reads as down and not as a timeout. */
const PROBE_TIMEOUT_MS = 800;

/**
 * The agent's answer to the load balancer's check for one service: 200 only when the release booted, the machine is not draining, and the
 * service's own `/health` answers 2xx with the release this machine was made for in `x-app-version`; 503 otherwise, which takes the machine
 * out of the pool within a second and a half.
 */
export function healthAnswer(state: AgentState, probe: ServiceProbe | undefined, release: string): 200 | 503 {
  if (!state.booted || state.draining || !probe) return 503;
  return probe.status >= 200 && probe.status < 300 && probe.version === release ? 200 : 503;
}

/** Ask a service's own `/health` on the machine. */
export async function probeService(port: number): Promise<ServiceProbe> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${healthContract.path}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return { status: res.status, version: res.headers.get(healthContract.versionHeader) ?? undefined };
  } catch {
    return { status: 0 };
  }
}

/**
 * Serve `/health/<service>` on each service's agent port, on every address of the host: the load balancer reaches it over the private
 * network, which the role's security group admits it to. A draining or unbooted machine answers without asking the service.
 */
export function serveHealth(opts: {
  ports: readonly AgentPort[];
  release: string;
  state: () => AgentState;
  probe?: (port: number) => Promise<ServiceProbe>;
  log: (message: string) => void;
}): { close(): Promise<void> } {
  const probe = opts.probe ?? probeService;
  const servers: Server[] = opts.ports.map(({ service, agentPort, port }) => {
    const server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== `/health/${service}`) {
        res.writeHead(404).end();
        return;
      }
      const state = opts.state();
      const answer = state.booted && !state.draining ? probe(port) : Promise.resolve(undefined);
      void answer.then((result) => res.writeHead(healthAnswer(state, result, opts.release)).end());
    });
    server.on('error', (error) => opts.log(`agent port ${agentPort} for ${service}: ${error.message}`));
    server.listen(agentPort, '0.0.0.0');
    return server;
  });
  return {
    close: () => Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done())))).then(() => undefined),
  };
}
