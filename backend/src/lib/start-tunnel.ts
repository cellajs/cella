import chalk from 'chalk';

import type { AddressInfo } from 'node:net';
import { env } from '../env';

/**
 * Starts an tunnel to expose the local development server to the internet.
 * This function will only attempt to start a tunnel if the environment is set to 'development'
 * and the `TUNNEL_URL` and `TUNNEL_AUTH_TOKEN` environment variables are configured.
 *
 * @param info - An object containing information about the started server,
 * specifically its `port` property. This typically comes from the
 * callback of `@hono/node-server`'s `serve` function.
 *
 * @returns A Promise that resolves to the public URL (string) if the tunnel
 * is successfully established, or `null` if the tunnel is not configured,
 * not in a development environment, or if the connection fails.
 */
const startTunnel = async (info: AddressInfo): Promise<string | null> => {
  // Check if tunnel is configured via environment variables
  if (!env.TUNNEL_URL || !env.TUNNEL_AUTH_TOKEN) return null;

  try {
    const ngrok = (await import('@ngrok/ngrok')).default;

    const listener = await ngrok.connect({
      addr: info.port,
      authtoken: env.TUNNEL_AUTH_TOKEN,
      domain: new URL(env.TUNNEL_URL).hostname, // Extract hostname from TUNNEL_URL
    });

    // Optional: Add a graceful shutdown for tunnel (ensures tunnel is properly closed)
    process.on('SIGINT', async () => {
      console.warn(chalk.yellow('Shutting down tunnel'));
      await ngrok.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.warn(chalk.yellow('Shutting down tunnel'));
      await ngrok.disconnect();
      process.exit(0);
    });

    return listener.url();
  } catch (err) {
    console.warn(chalk.red('Tunnel connection failed'), err);
    // Depending on your development setup, you might want to `process.exit(1)` here
    // if the tunnel is critical for development. For now, it just logs and returns null.
    return null;
  }
};

export default startTunnel;
