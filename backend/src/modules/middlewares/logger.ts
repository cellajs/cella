import type { MiddlewareHandler } from 'hono/types';

enum LogPrefix {
  Outgoing = '->',
  Incoming = '<-',
  Error = 'xx',
}

const humanize = (times: string[]) => {
  const [delimiter, separator] = [',', '.'];

  const orderTimes = times.map((v) => v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, `$1${delimiter}`));

  return orderTimes.join(separator);
};

const time = (start: number) => {
  const delta = Date.now() - start;
  return humanize([delta < 1000 ? `${delta}ms` : `${Math.round(delta / 1000)}s`]);
};

type PrintFunc = (str: string, ...rest: string[]) => void;

function log(fn: PrintFunc, prefix: string, method: string, path: string, status = 0, elapsed?: string, user?: string, org?: string) {
  const out = prefix === LogPrefix.Incoming ? `${prefix} ${method} ${path}` : `${prefix} ${method} ${path} ${status} ${elapsed} ${user}@${org}`;
  fn(out);
}


export const logger = (fn: PrintFunc = console.log): MiddlewareHandler => {
  return async function logger(c, next) {
    const { method } = c.req;

    // Show path with query on incoming logs and without on outgoing logs
    const stripUrl = c.req.raw.url.match(/^https?:\/\/[^/]+(\/[^?]*)(\?.*)?/) || [];
    const path = stripUrl[1]
    const fullPath = stripUrl[1] + stripUrl[2]

    log(fn, LogPrefix.Incoming, method, fullPath);

    const start = Date.now();

    await next();

    // Add logging for user and organization ids
    const user = c.get('user')?.id || 'na';
    const org = c.get('organization')?.id || 'na';
    
    log(fn, LogPrefix.Outgoing, method, path, c.res.status, time(start), user, org);
  };
};
