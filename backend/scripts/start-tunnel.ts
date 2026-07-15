import pc from 'picocolors';
import { appConfig } from 'shared';
import { env } from '../src/env';

/**
 * Starts a tunnel that exposes the local app origin to the internet. The tunnel fronts
 * the Vite dev server — which proxies /api, /yjs and /mcp to the service ports — so the
 * whole stack shares one public origin: cookies stay first-party and OAuth provider
 * callbacks (`<tunnel>/api/auth/...`) reach the backend through the proxy.
 * Only attempts to start when `TUNNEL_URL` and `TUNNEL_AUTH_TOKEN` are configured.
 *
 * @returns The public URL, or `null` if the tunnel is unconfigured or fails to connect.
 */
const startTunnel = async (): Promise<string | null> => {
  // Check if tunnel is configured via environment variables
  if (!env.TUNNEL_URL || !env.TUNNEL_AUTH_TOKEN) return null;

  try {
    const ngrok = (await import('@ngrok/ngrok')).default;

    const listener = await ngrok.connect({
      // The Vite dev server is the app origin (frontendUrl is the public tunnel domain, no port).
      addr: Number(new URL(appConfig.frontendUrl).port) || 3000,
      authtoken: env.TUNNEL_AUTH_TOKEN,
      domain: new URL(env.TUNNEL_URL).hostname, // Extract hostname from TUNNEL_URL
    });

    // Optional: Add a graceful shutdown for tunnel (ensures tunnel is properly closed)
    process.on('SIGINT', async () => {
      console.warn(pc.yellow('Shutting down tunnel'));
      await ngrok.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.warn(pc.yellow('Shutting down tunnel'));
      await ngrok.disconnect();
      process.exit(0);
    });

    return listener.url();
  } catch (err) {
    console.warn(pc.red('Tunnel connection failed'), err);
    // Depending on your development setup, you might want to `process.exit(1)` here
    // if the tunnel is critical for development. For now, it just logs and returns null.
    return null;
  }
};

export { startTunnel };
