import { afterEach, describe, expect, it } from 'vitest';
import { forgetOwnerKey, forgetSession, rememberedOwnerKey, rememberOwnerKey } from './session';

afterEach(() => {
  forgetSession();
});

describe('session memory', () => {
  it('holds nothing until the operator typed something', () => {
    expect(rememberedOwnerKey()).toBeUndefined();
  });

  it('gives back the Owner API key it was handed, and drops it so a key that failed its validation is asked again', () => {
    rememberOwnerKey({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
    expect(rememberedOwnerKey()).toEqual({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
    forgetOwnerKey();
    expect(rememberedOwnerKey()).toBeUndefined();
  });
});
