import { randomBytes } from 'node:crypto';

/**
 * A database URL whose password a test proves never leaves the process. Built at run time: a literal here reads as a
 * leaked password to secret scanners.
 */
export function leakableDsn(): { password: string; dsn: string } {
  const password = ['pg', 'pw', randomBytes(5).toString('hex')].join('-');
  return { password, dsn: `postgresql://app:${password}@10.0.0.5:5432/app?sslmode=require` };
}
