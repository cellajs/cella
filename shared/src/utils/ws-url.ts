/** appConfig URLs are canonically HTTPS; only browser WebSocket connects need the wss:// form. */
export const toWsUrl = (httpUrl: string): string => httpUrl.replace(/^http/, 'ws');
