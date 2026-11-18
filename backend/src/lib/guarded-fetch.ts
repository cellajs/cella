import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { isPublicDestination } from '#/utils/ip-subnet';

/** A platform's configuration or registration answer is a few kilobytes. */
const maxResponseBytes = 256 * 1024;

/** From the request until the last byte of the body. */
const timeoutMs = 10_000;

/** One resolved address of a host. */
export interface ResolvedAddress {
  address: string;
  /** 4 or 6. */
  family: number;
}

/** Every address a host name resolves to. */
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

/** One request to a vetted address: what {@link guardedFetch} hands its transport once the host passed. */
export interface GuardedRequest {
  url: URL;
  /** The address to connect to: the host is never resolved again. */
  target: ResolvedAddress;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

/** Sends one request and answers as it arrives: no redirect followed, the body unread. */
export type GuardedTransport = (request: GuardedRequest) => Promise<Response>;

export interface GuardedFetchInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Tests answer from a fake host; production resolves through the system resolver. */
  resolve?: HostResolver;
  /** Tests answer from a fake host; production connects through `node:https`, or `node:http` where allowed. */
  transport?: GuardedTransport;
}

export interface GuardedResponse {
  status: number;
  headers: Headers;
  text: string;
}

// Two apps on one machine talk over plain HTTP on localhost while developing and in tests.
const allowsLocalHosts = () => appConfig.mode === 'development' || appConfig.mode === 'test';

const isLoopback = (address: string) => address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');

const refused = (reason: string) => new AppError(400, 'outbound_request_refused', 'warn', { meta: { reason } });
const failed = (reason: string) => new AppError(400, 'outbound_request_failed', 'warn', { meta: { reason } });

/** Whether the backend may fetch a URL by its scheme: HTTPS, or plain HTTP in development and test. */
export const isFetchableUrl = (url: string): boolean => {
  if (!URL.canParse(url)) return false;
  const { protocol, username, password } = new URL(url);
  if (username || password) return false;
  return protocol === 'https:' || (protocol === 'http:' && allowsLocalHosts());
};

const systemResolver: HostResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });

/** Hands the socket the vetted address whichever form of answer it asks for. */
const pinnedLookup =
  ({ address, family }: ResolvedAddress): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };

const nodeTransport: GuardedTransport = ({ url, target, method, headers, body, signal }) =>
  new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method, headers, signal, lookup: pinnedLookup(target) }, (response) => {
      const status = response.statusCode ?? 502;
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      // Read as it arrives; cancelling the stream at the size cap closes the connection.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          response.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          response.on('end', () => controller.close());
          response.on('error', (err) => controller.error(err));
        },
        cancel: () => void response.destroy(),
      });
      const hasBody = ![204, 205, 304].includes(status);
      resolve(new Response(hasBody ? body : null, { status, headers: responseHeaders }));
    });
    request.on('error', reject);
    request.end(body);
  });

/** The addresses of a URL's host: the literal itself, or what the resolver answers. */
const addressesOf = async (url: URL, resolve: HostResolver): Promise<ResolvedAddress[]> => {
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return resolve(hostname).catch(() => {
    throw failed('unresolved');
  });
};

/** Reads the body up to the cap; past it the stream is cancelled, which closes the connection. */
const readCapped = async (response: Response): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxResponseBytes) {
      await reader.cancel();
      throw failed('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * Fetches a URL a tenant or a third party supplied: the one way the backend reaches such an address. Only HTTPS,
 * and every address the host resolves to must be public. The connection goes to a vetted address without resolving
 * again: a host cannot answer the check with one address and the connection with another. No redirect is followed,
 * and the answer is capped in size and time. Development and test also allow plain HTTP and loopback.
 * @throws AppError 400 `outbound_request_refused` for a scheme, an address or a redirect it refuses, 400
 *   `outbound_request_failed` for a host that does not resolve, answer in time or within the size cap.
 */
export const guardedFetch = async (url: string, init: GuardedFetchInit = {}): Promise<GuardedResponse> => {
  const { method = 'GET', headers = {}, body, resolve = systemResolver, transport = nodeTransport } = init;
  if (!isFetchableUrl(url)) throw refused('scheme');
  const parsed = new URL(url);

  const addresses = await addressesOf(parsed, resolve);
  const allowed = (address: string) => isPublicDestination(address) || (allowsLocalHosts() && isLoopback(address));
  if (!addresses.length || !addresses.every(({ address }) => allowed(address))) throw refused('address');

  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await transport({ url: parsed, target: addresses[0], method, headers, body, signal });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw refused('redirect');
    }
    return { status: response.status, headers: response.headers, text: await readCapped(response) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw failed(signal.aborted ? 'timeout' : 'network');
  }
};
