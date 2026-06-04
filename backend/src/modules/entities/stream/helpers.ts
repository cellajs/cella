import type { SSEStreamingApi } from 'hono/streaming';

/**
 * Stable error codes the server can emit on the SSE stream so the client can
 * react beyond a generic transport failure (e.g. stop reconnecting on auth loss).
 */
export type StreamErrorCode = 'unauthorized' | 'forbidden' | 'tenant_revoked' | 'server_shutdown' | 'internal';

export interface StreamErrorPayload {
  code: StreamErrorCode;
  message: string;
}

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
 * Write a change event with pre-serialized data (avoids redundant JSON.stringify).
 */
export async function writeChangeRaw(stream: SSEStreamingApi, id: string, serializedData: string): Promise<void> {
  await stream.writeSSE({
    event: 'change',
    id,
    data: serializedData,
  });
}

/**
 * Write offset event (catch-up complete marker).
 */
export async function writeOffset(stream: SSEStreamingApi, cursor: string | null): Promise<void> {
  await stream.writeSSE({
    event: 'offset',
    data: cursor ?? '',
  });
}

/**
 * Write an application-level error event. Caller is expected to close the stream
 * (return from the streamSSE callback) after emitting this so the client doesn't
 * receive further events on a doomed connection.
 */
export async function writeError(stream: SSEStreamingApi, payload: StreamErrorPayload): Promise<void> {
  await stream.writeSSE({
    event: 'error',
    data: JSON.stringify(payload),
  });
}

/**
 * Write an SSE heartbeat as a comment line. Per the SSE spec, lines starting
 * with `:` are ignored by EventSource — they keep the socket and any proxies
 * (Caddy, nginx, Cloudflare) from idling out, without firing a client event.
 */
export async function writeHeartbeat(stream: SSEStreamingApi): Promise<void> {
  await stream.write(': ping\n\n');
}

/**
 * Keep-alive loop. Runs until stream is aborted.
 */
export async function keepAlive(stream: SSEStreamingApi, intervalMs = 30000): Promise<void> {
  while (true) {
    await writeHeartbeat(stream);
    await stream.sleep(intervalMs);
  }
}
