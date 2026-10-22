import { performance } from 'node:perf_hooks';
import { COUNTED, errorCode } from './http';
import type { Metrics } from './metrics';
import type { SseEvent, SseOptions } from './types';

/** Time to the response headers of a stream: past it the connect counts as a timeout. */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * An incremental `text/event-stream` parser: feed it decoded text in any chunking, it calls `onEvent` per dispatched
 * event. Lines end in LF, CRLF or CR; `data` lines join with LF; comments and events without data are skipped.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): (chunk: string) => void {
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;

  const line = (text: string) => {
    if (text === '') {
      if (data.length > 0) onEvent({ event: event || 'message', data: data.join('\n'), ...(id !== undefined && { id }) });
      event = '';
      data = [];
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    const value = colon === -1 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
  };

  return (chunk) => {
    buffer += chunk;
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if (char !== '\n' && char !== '\r') continue;
      // A CR that ends the chunk may be the first half of a CRLF: the next chunk decides.
      if (char === '\r' && i === buffer.length - 1) break;
      line(buffer.slice(start, i));
      if (char === '\r' && buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    buffer = buffer.slice(start);
  };
}

/**
 * Reads an event stream with `fetch` until it ends or a signal aborts. The connect counts as a request of its endpoint
 * (status, time to headers); a transport error rejects, a non-2xx status resolves at once.
 */
export async function readSse(
  url: string,
  onEvent: (event: SseEvent) => void,
  options: SseOptions,
  metrics: Metrics,
  vuSignal: AbortSignal,
): Promise<number> {
  const label = options.name ?? `SSE ${new URL(url).pathname}`;
  const stats = metrics.endpoint(label);
  const connect = new AbortController();
  const signal = AbortSignal.any([vuSignal, connect.signal, ...(options.signal ? [options.signal] : [])]);
  const timer = setTimeout(
    () => connect.abort(Object.assign(new Error(`${label} sent no headers in ${CONNECT_TIMEOUT_MS} ms`), { code: 'ETIMEDOUT' })),
    CONNECT_TIMEOUT_MS,
  );
  const started = performance.now();
  stats.requests++;
  metrics.counter('http.requests');

  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'text/event-stream', ...options.headers }, signal });
  } catch (error) {
    clearTimeout(timer);
    if (options.signal?.aborted || vuSignal.aborted) return 0;
    const cause = connect.signal.aborted ? connect.signal.reason : error;
    const code = errorCode(cause);
    if (code === 'ETIMEDOUT') {
      stats.timeouts++;
      metrics.counter('http.timeouts');
    } else stats.errors++;
    metrics.counter(`errors.${code}`);
    throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), { [COUNTED]: true });
  }
  clearTimeout(timer);
  metrics.response(label, res.status, performance.now() - started);
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    return res.status;
  }

  const push = createSseParser(onEvent);
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) push(decoder.decode(chunk, { stream: true }));
  } catch (error) {
    if (!signal.aborted) throw error;
  }
  return res.status;
}
