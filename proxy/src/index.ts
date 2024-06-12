export interface Env {
  BACKEND_RENDER_URL: string;
  FRONTEND_RENDER_URL: string;
  TUS_RENDER_URL: string;
  ELECTRIC_RENDER_URL: string;
}

const handler: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.host.startsWith('www.')) {
      return Response.redirect(url.href.replace('www.', ''), 301);
    }

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 301);
    }

    let apiServerUrl: string | null = null;
    let additionalHeaders: HeadersInit | null = null;

    if (url.pathname.startsWith('/upload/v1')) {
      apiServerUrl = env.TUS_RENDER_URL + url.pathname.replace('/upload/v1', '') + url.search;
    } else if (url.pathname.startsWith('/electric/v1')) {
      apiServerUrl = env.ELECTRIC_RENDER_URL + url.pathname.replace('/electri/v1', '') + url.search;
    } else if (url.pathname.startsWith('/api/v1')) {
      apiServerUrl = env.BACKEND_RENDER_URL + url.pathname.replace('/api/v1', '') + url.search;
      additionalHeaders = {
        'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
        'X-Forwarded-Host': url.host,
        'X-Forwarded-Proto': url.protocol.replace(':', ''),
      };
    } else {
      apiServerUrl = env.FRONTEND_RENDER_URL + url.pathname + url.search;
    }

    if (apiServerUrl) {
      let headers = new Headers(request.headers);

      if (additionalHeaders) {
        headers = new Headers(request.headers);
        headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
        headers.set('X-Forwarded-Host', url.host);
        headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      }

      const apiRequest = new Request(apiServerUrl, {
        method: request.method,
        headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'follow',
      });

      return fetch(apiRequest);
    }

    return new Response('Not found by proxy. Contact system administrator', { status: 404 });
  },
};

export default handler;