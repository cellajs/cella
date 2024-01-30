export interface Env {
  BACKEND_RENDER_URL: string;
  FRONTEND_RENDER_URL: string;
  TUS_RENDER_URL: string;
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

    if (url.pathname.startsWith('/upload')) {
      const pathname = url.pathname.split('/upload').pop();
      const apiServerUrl = env.TUS_RENDER_URL + pathname + url.search;
      const apiRequest = new Request(apiServerUrl, request);
      return fetch(apiRequest);
    }

    if (url.pathname.startsWith('/api/v1')) {
      const pathname = url.pathname.split('/api/v1').pop();
      const apiServerUrl = env.BACKEND_RENDER_URL + pathname + url.search;
      // Here we preserve the original request's headers and method
      const apiRequest = new Request(apiServerUrl, {
        ...request,
        headers: {
          ...request.headers,
          'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
          'X-Forwarded-Host': url.host,
          'X-Forwarded-Proto': url.protocol.replace(':', ''),
        },
      });
      return fetch(apiRequest);
    }

    // For all other paths, serve from the React app server
    const appServerUrl = env.FRONTEND_RENDER_URL + url.pathname;
    // Here we preserve the original request's headers and method
    const appRequest = new Request(appServerUrl, request);
    return fetch(appRequest);
  },
};

export default handler;
