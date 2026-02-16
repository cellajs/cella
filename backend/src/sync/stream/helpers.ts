import type { SSEStreamingApi } from 'hono/streaming';

/**
 * Write a change event to SSE stream.
 */
export async function writeChange(stream: SSEStreamingApi, id: string, data: unknown): Promise<void> {
  await stream.writeSSE({
    event: 'change',
    id,
    data: JSON.stringify(data),
  });
}

/**
 * Write offset event (catch-up complete marker).
 */
export async function writeOffset(stream: SSEStreamingApi, cursor: string | null): Promise<void> {
  await stream.writeSSE({
    event: 'offset',
    data: JSON.stringify({ cursor }),
  });
}

/**
 * Write ping event (keep-alive).
 */
export async function writePing(stream: SSEStreamingApi): Promise<void> {
  await stream.writeSSE({
    event: 'ping',
    data: 'pong',
  });
}

/**
 * Keep-alive loop. Runs until stream is aborted.
 */
export async function keepAlive(stream: SSEStreamingApi, intervalMs = 30000): Promise<void> {
  while (true) {
    await writePing(stream);
    await stream.sleep(intervalMs);
  }
}
