import { describe, expect, it } from 'vitest';
import { dsnOnOrigin } from './monitoring-dsn.ts';

const origin = 'http://localhost:3153';

describe('dsnOnOrigin', () => {
  it.each([
    ['a localhost DSN without a port', 'http://pk_0001@localhost/1', origin, 'http://pk_0001@localhost:3153/1'],
    ['one with a path before its project', 'http://pk_0001@localhost/ingest/1', origin, 'http://pk_0001@localhost:3153/ingest/1'],
    ['one over https', 'https://pk_0001@localhost/1', origin, 'http://pk_0001@localhost:3153/1'],
    ['one under a tunnel', 'http://pk_0001@localhost/ingest/1', 'https://app.ngrok.dev', 'https://pk_0001@app.ngrok.dev/ingest/1'],
  ])('moves %s to the origin and keeps its key and path', (_case, dsn, own, moved) => {
    expect(dsnOnOrigin(dsn, own)).toBe(moved);
  });

  it.each([
    ['a localhost DSN with a port', 'http://pk_0001@localhost:3000/1'],
    ['one that writes out the default port', 'http://pk_0001@localhost:80/1'],
    ['a DSN on another host', 'https://pk_0001@ingest.example.com/1'],
    ['one on a loopback address', 'http://pk_0001@127.0.0.1/1'],
    ['an empty DSN', ''],
    ['a text that is no URL', 'not a dsn'],
  ])('leaves %s as written', (_case, dsn) => {
    expect(dsnOnOrigin(dsn, origin)).toBe(dsn);
  });
});
