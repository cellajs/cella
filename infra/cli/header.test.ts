import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { formatHeader } from './header';

const plain = (line: string) => stripVTControlCharacters(line);

describe('formatHeader', () => {
  it('fills 60 columns between the tool on the left and the environment on the right, and names a stack not set up yet', () => {
    const [line, divider] = formatHeader({ slug: 'acme', version: '0.47.1', environment: 'production', state: 'bootstrapped', host: 'www.acme.dev' });
    expect(plain(line)).toBe('⧈ acme infra · 0.47.1              production · www.acme.dev');
    expect(plain(line)).toHaveLength(plain(divider).length);
    const partial = plain(formatHeader({ slug: 'acme', environment: 'staging', state: 'partial' })[0]);
    expect(partial).toMatch(/^⧈ acme infra +staging · setup not finished$/);
    expect(partial).toHaveLength(60);
    expect(plain(formatHeader({ slug: 'acme', environment: 'staging', state: 'fresh' })[0])).toMatch(/staging · new$/);
  });
});
