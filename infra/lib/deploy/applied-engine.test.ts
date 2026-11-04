import { describe, expect, it } from 'vitest';
import { canonicalJson, descriptionHash } from './applied-engine';

describe('the description hash', () => {
  it('is one hash for one description, whatever its key order and layout: an apply and a builder of another commit must agree', () => {
    const written = { services: { backend: { port: 4000, env: { A: '1' } } }, mode: 'production', list: [1, { b: 2, a: 1 }], gone: undefined };
    const reread = JSON.parse(
      '{ "list": [1, {"a": 1,\n  "b": 2}],\n  "mode": "production",\n  "services": {"backend": {"env": {"A": "1"}, "port": 4000}}}',
    );
    expect(canonicalJson(written)).toBe('{"list":[1,{"a":1,"b":2}],"mode":"production","services":{"backend":{"env":{"A":"1"},"port":4000}}}');
    expect(descriptionHash(written)).toBe(descriptionHash(reread));
    expect(descriptionHash(written)).toMatch(/^[0-9a-f]{64}$/);
    expect(descriptionHash({ ...written, mode: 'staging' })).not.toBe(descriptionHash(written));
    expect(descriptionHash({ ...written, list: [{ a: 1, b: 2 }, 1] })).not.toBe(descriptionHash(written));
  });
});
