import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import type { Metrics } from './metrics';
import type { HttpClient, HttpRequestOptions, HttpResponse } from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Set on an error the HTTP client already counted, so the VU that fails on it does not count it again. */
export const COUNTED = Symbol('counted');

/** The counter suffix of an error: its system code (`ECONNRESET`), else its name. */
export function errorCode(error: unknown): string {
  if (error instanceof Error) return (error as NodeJS.ErrnoException).code ?? error.name;
  return 'unknown';
}

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** `METHOD /path` without the query: the label of a request that names none. */
function defaultLabel(method: string, url: URL): string {
  return `${method} ${url.pathname}`;
}

/**
 * An HTTP client for one VU: one keep-alive connection (`maxSockets: 1`, as Artillery gives each VU), every body read
 * to its end. `http.response_time` is the time from the request's last byte sent to the response's first byte, the
 * time to first byte as Artillery measures it; `http.total_time` runs from the call to the last body byte.
 */
export function createHttpClient(target: string, metrics: Metrics, signal: AbortSignal): HttpClient & { close(): void } {
  const agents = new Map<string, http.Agent>();
  const agentFor = (url: URL) => {
    let agent = agents.get(url.protocol);
    if (!agent) {
      agent = url.protocol === 'https:' ? new https.Agent({ keepAlive: true, maxSockets: 1 }) : new http.Agent({ keepAlive: true, maxSockets: 1 });
      agents.set(url.protocol, agent);
    }
    return agent;
  };

  const request = (method: string, path: string, options: HttpRequestOptions = {}): Promise<HttpResponse> => {
    const url = new URL(/^https?:\/\//.test(path) ? path : `${target}${path}`);
    const label = options.name ?? defaultLabel(method, url);
    const stats = metrics.endpoint(label);
    const headers: Record<string, string> = { ...options.headers };
    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['content-type'] ??= 'application/json';
    }
    if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));

    return new Promise<HttpResponse>((resolve, reject) => {
      if (signal.aborted) return reject(codedError('EABORTED', 'the run stopped'));
      const started = performance.now();
      let connectedAt = 0;
      let sentAt = 0;
      let settled = false;
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(url, { method, headers, agent: agentFor(url) });

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        if (!signal.aborted) {
          const code = errorCode(error);
          if (code === 'ETIMEDOUT') {
            stats.timeouts++;
            metrics.counter('http.timeouts');
          } else stats.errors++;
          metrics.counter(`errors.${code}`);
          Object.assign(error, { [COUNTED]: true });
        }
        reject(error);
      };
      const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => req.destroy(codedError('ETIMEDOUT', `${label} took longer than ${timeoutMs} ms`)), timeoutMs);
      const onAbort = () => req.destroy(codedError('EABORTED', 'the run stopped'));
      signal.addEventListener('abort', onAbort, { once: true });

      req.on('socket', (socket) => {
        if (socket.connecting) socket.once('connect', () => (connectedAt = performance.now()));
      });
      req.on('finish', () => (sentAt = performance.now()));
      req.on('error', fail);
      req.on('response', (res) => {
        const firstByteAt = performance.now();
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', fail);
        res.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          const status = res.statusCode ?? 0;
          const ttfb = firstByteAt - Math.max(sentAt || started, connectedAt);
          metrics.response(label, status, ttfb, performance.now() - started);
          const buffer = Buffer.concat(chunks);
          resolve({
            status,
            ok: status >= 200 && status < 300,
            headers: res.headers,
            body: buffer,
            text: () => buffer.toString('utf8'),
            json: <T>() => JSON.parse(buffer.toString('utf8')) as T,
          });
        });
      });

      stats.requests++;
      metrics.counter('http.requests');
      req.end(body);
    });
  };

  return {
    request,
    get: (url, options) => request('GET', url, options),
    post: (url, options) => request('POST', url, options),
    put: (url, options) => request('PUT', url, options),
    patch: (url, options) => request('PATCH', url, options),
    delete: (url, options) => request('DELETE', url, options),
    close: () => {
      for (const agent of agents.values()) agent.destroy();
    },
  };
}
