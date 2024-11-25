import { hc } from 'hono/client';

type hcWithType<C> = (...args: Parameters<typeof hc>) => C;

export function createHc<C>(path: string): hcWithType<C>;

export function createHc(path: string) {
  return (...args: Parameters<typeof hc>) => {
    const [basePath, options] = args;
    return hc(`${basePath}${path}`, options);
  };
}
