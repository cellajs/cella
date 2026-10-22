import { spawn, spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { env } from '../src/env';

/** How long ngrok gets to report its tunnel. */
const startTimeoutMs = 20_000;

/**
 * Starts a tunnel that exposes the local app origin to the internet. The tunnel fronts
 * the Vite dev server, which proxies /api, /yjs and /mcp to the service ports, so the
 * whole stack shares one public origin: cookies stay first-party and OAuth provider
 * callbacks (`<tunnel>/api/auth/...`) reach the backend through the proxy.
 * Runs the ngrok CLI (`brew install ngrok`), and only when `TUNNEL_URL` and `TUNNEL_AUTH_TOKEN` are configured.
 *
 * @returns The public URL, or `null` if the tunnel is unconfigured, the CLI is missing or it fails to connect.
 */
const startTunnel = async (): Promise<string | null> => {
  if (!env.TUNNEL_URL || !env.TUNNEL_AUTH_TOKEN) return null;
  if (spawnSync('ngrok', ['version'], { stdio: 'ignore' }).error) {
    console.warn(pc.yellow('Tunnel skipped: the ngrok CLI is not installed (brew install ngrok, or https://ngrok.com/download)'));
    return null;
  }

  // The Vite dev server is the app origin (frontendUrl is the public tunnel domain, no port).
  const port = Number(new URL(appConfig.frontendUrl).port) || appConfig.devPorts.frontend;
  const domain = new URL(env.TUNNEL_URL).hostname;
  // The token goes in as a flag: older CLIs prefer the one in their own config over NGROK_AUTHTOKEN.
  const args = ['http', String(port), `--domain=${domain}`, `--authtoken=${env.TUNNEL_AUTH_TOKEN}`, '--log=stdout', '--log-format=json'];
  const tunnel = spawn('ngrok', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  process.on('exit', () => tunnel.kill());

  return new Promise((resolve) => {
    let settled = false;
    const settle = (url: string | null, reason?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Tunnel failure is non-fatal in development, so log it and go on without one.
      if (!url) console.warn(pc.red('Tunnel connection failed'), reason);
      resolve(url);
    };
    const timer = setTimeout(() => settle(null, `no tunnel after ${startTimeoutMs / 1000} s`), startTimeoutMs);
    let lastError: string | undefined;
    tunnel.on('exit', (code) => settle(null, lastError ?? `ngrok exited with code ${code}`));

    let pending = '';
    tunnel.stdout.setEncoding('utf8');
    tunnel.stdout.on('data', (chunk: string) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as { msg?: string; url?: string; err?: string; lvl?: string };
          if (record.msg === 'started tunnel' && record.url) settle(record.url);
          else if (record.err && (record.lvl === 'eror' || record.lvl === 'crit')) lastError = record.err.trim();
        } catch {
          // The usage text ngrok prints after a failed start is plain text.
        }
      }
    });
  });
};

export { startTunnel };
