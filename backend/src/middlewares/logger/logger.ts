import type { MiddlewareHandler } from 'hono/types';
import { nanoid } from '#/utils/nanoid';

enum LogPrefix {
  Outgoing = 'res',
  Incoming = 'req',
  Error = 'err',
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

type PrintFunc = (str: string) => void;

function log(fn: PrintFunc, prefix: string, logId: string, method: string, path: string, status = 0, elapsed?: string, user?: string, org?: string) {
  const out =
    prefix === LogPrefix.Incoming
      ? `${prefix} ${logId} ${method} ${path}`
      : `${prefix} ${logId} ${method} ${path} ${status} ${elapsed} ${user}@${org}`;
  fn(out);
}

export const logger = (fn: PrintFunc = console.info): MiddlewareHandler => {
  return async function logger(c, next) {
    const { method } = c.req;

    // Generate logId and set it so we can use it to match error reports
    const logId = nanoid();
    c.set('logId', logId);

    // Show path with search params
    const stripUrl = c.req.raw.url.replace(/(https?:\/\/)?([^\/]+)/, '').slice(0, 150);

    // Log incoming
    log(fn, LogPrefix.Incoming, logId, method, stripUrl);

    const start = Date.now();

    await next();

    // Add logging for user and organization ids
    const user = c.get('user')?.id || 'na';
    const org = c.get('organization')?.id || 'na';

    // Log outgoing
    log(fn, LogPrefix.Outgoing, logId, method, stripUrl, c.res.status, time(start), user, org);
  };
};
