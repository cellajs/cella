import { describe, expect, it } from 'vitest';
import { envFileValues } from './runtime-secrets';

describe('envFileValues', () => {
  it('learns every value of the env file once, an equals sign inside a value included', () => {
    expect(envFileValues('A=one\nB=postgres://u:p@h/db?x=1\nC=one\n\n')).toEqual(['one', 'postgres://u:p@h/db?x=1']);
  });
});
