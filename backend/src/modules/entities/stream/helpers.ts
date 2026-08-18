import type { SSEStreamingApi } from 'hono/streaming';

/** Stable codes so a client can react beyond a generic transport failure. */
export type StreamErrorCode = 'unauthorized' | 'forbidden' | 'tenant_revoked' | 'server_shutdown' | 'internal';

export interface StreamErrorPayload {
  code: StreamErrorCode;
  message: string;
}

export async function writeChange(stream: SSEStreamingApi, id: string, data: unknown): Promise<void> {
  await stream.writeSSE({
    event: 'change',
    id,
    data: JSON.stringify(data),
  });
}

export async function writeChangeRaw(stream: SSEStreamingApi, id: string, serializedData: string): Promise<void> {
  await stream.writeSSE({
    event: 'change',
    id,
    data: serializedData,
  });
}

/** Catch-up complete marker. */
export async function writeOffset(stream: SSEStreamingApi, cursor: string | null): Promise<void> {
  await stream.writeSSE({
    event: 'offset',
    data: cursor ?? '',
  });
}

/** The caller must return from the streamSSE callback after this, closing the stream. */
export async function writeError(stream: SSEStreamingApi, payload: StreamErrorPayload): Promise<void> {
  await stream.writeSSE({
    event: 'error',
    data: JSON.stringify(payload),
  });
}

/**
 * A comment line: per the SSE spec, lines starting with `:` are ignored by EventSource, so this
 * keeps the socket and any proxies from idling out without firing a client event.
 */
export async function writeHeartbeat(stream: SSEStreamingApi): Promise<void> {
  await stream.write(': ping\n\n');
}

/** Runs until the stream is aborted. */
export async function keepAlive(stream: SSEStreamingApi, intervalMs = 30000): Promise<void> {
  while (true) {
    await writeHeartbeat(stream);
    await stream.sleep(intervalMs);
  }
}
