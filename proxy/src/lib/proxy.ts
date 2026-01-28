import type { Context } from 'hono';

/**
 * Options for forwarding a request to an upstream service.
 */
export interface ForwardOptions {
  /** The base URL of the upstream service (e.g., http://localhost:4000) */
  targetUrl: string;

  /** Optional path prefix to strip from the request (e.g., '/api') */
  stripPrefix?: string;

  /** Optional additional headers to add to the forwarded request */
  additionalHeaders?: Record<string, string>;

  /** Timeout for the upstream request in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Forwards an HTTP request to an upstream service.
 * Handles headers, body streaming, and response forwarding.
 *
 * @param c - The Hono context
 * @param options - Forward options
 * @returns Response from the upstream service
 */
export async function forwardRequest(c: Context, options: ForwardOptions): Promise<Response> {
  const { targetUrl, stripPrefix, additionalHeaders, timeout = 30000 } = options;

  // Build the target path
  let path = c.req.path;
  if (stripPrefix && path.startsWith(stripPrefix)) {
    path = path.slice(stripPrefix.length) || '/';
  }

  // Construct target URL with query string
  const url = new URL(path, targetUrl);
  url.search = new URL(c.req.url).search;

  // Prepare headers
  const headers = new Headers(c.req.raw.headers);

  // Set forwarded headers
  const host = c.req.header('host');
  if (host) {
    headers.set('X-Forwarded-Host', host);
  }
  headers.set('X-Forwarded-Proto', c.req.header('x-forwarded-proto') ?? 'http');

  // Add any additional headers
  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      headers.set(key, value);
    }
  }

  // Determine if we should stream the body
  const method = c.req.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: hasBody ? c.req.raw.body : undefined,
      signal: controller.signal,
      duplex: hasBody ? 'half' : undefined,
    });

    clearTimeout(timeoutId);

    // Return the response with its original headers
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Gateway timeout' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Connection refused or other network error
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Health status for a service check.
 */
export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
}

/**
 * Check if an upstream service is healthy by making an HTTP request.
 *
 * @param url - URL to check (e.g., http://localhost:4000/ping)
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Health status of the service
 */
export async function checkServiceHealth(url: string, timeout = 5000): Promise<ServiceHealth> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (response.ok) {
      return { status: 'healthy', latency };
    }

    return { status: 'degraded', latency, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'unhealthy', error: 'Timeout' };
    }

    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
