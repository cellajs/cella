/**
 * Convert an http(s):// origin to its ws(s):// equivalent for WebSocket clients.
 * appConfig URLs are canonically HTTPS; only browser-side WebSocket connects
 * need the wss:// form.
 */
export const toWsUrl = (httpUrl: string): string => httpUrl.replace(/^http/, 'ws');
