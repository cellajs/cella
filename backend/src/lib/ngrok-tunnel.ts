import ngrok from '@ngrok/ngrok';
import chalk from 'chalk';

import type { AddressInfo } from 'node:net';
import { env } from '../env';

/**
 * Starts an ngrok tunnel to expose the local development server to the internet.
 * This function will only attempt to start a tunnel if the environment is set to 'development'
 * and the `TUNNEL_URL` and `TUNNEL_AUTH_TOKEN` environment variables are configured.
 *
 * @param info - An object containing information about the started server,
 * specifically its `port` property. This typically comes from the
 * callback of `@hono/node-server`'s `serve` function.
 *
 * @returns A Promise that resolves to the public ngrok URL (string) if the tunnel
 * is successfully established, or `null` if the tunnel is not configured,
 * not in a development environment, or if the connection fails.
 */
export async function startNgrokTunnel(info: AddressInfo): Promise<string | null> {
  // Ensure ngrok is only started in development
  if (env.NODE_ENV !== 'development') {
    return null;
  }

  // Check if ngrok is configured via environment variables
  if (env.TUNNEL_URL && env.TUNNEL_AUTH_TOKEN) {
    try {
      const listener = await ngrok.connect({
        addr: info.port,
        authtoken: env.TUNNEL_AUTH_TOKEN,
        domain: new URL(env.TUNNEL_URL).hostname, // Extract hostname from TUNNEL_URL
      });

      // Optional: Add a graceful shutdown for ngrok (ensures the ngrok tunnel is properly closed)
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('Shutting down ngrok tunnel...'));
        await ngrok.disconnect();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log(chalk.yellow('Shutting down ngrok tunnel...'));
        await ngrok.disconnect();
        process.exit(0);
      });

      return listener.url();
    } catch (err) {
      console.error(chalk.red('ngrok connection failed:'), err);
      // Depending on your development setup, you might want to `process.exit(1)` here
      // if the tunnel is critical for development. For now, it just logs and returns null.
      return null;
    }
  }

  return null;
}
