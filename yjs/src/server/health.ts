import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { env } from '../env';
import { getActiveClientCount, getActiveDocumentCount } from '../sync/session-manager';
import { getConnectionCount } from './ws-server';

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.url?.startsWith('/health')) {
    const url = new URL(req.url, `http://localhost:${env.YJS_PORT}`);
    if (url.searchParams.get('depth') === 'full') {
      const body = JSON.stringify({
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        connections: getConnectionCount(),
        documents: getActiveDocumentCount(),
        clients: getActiveClientCount(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=5', ...SECURITY_HEADERS });
      res.end(body);
      return;
    }
    res.writeHead(204, { 'Cache-Control': 'public, max-age=5', ...SECURITY_HEADERS });
    res.end();
    return;
  }
  res.writeHead(404, SECURITY_HEADERS);
  res.end();
}
