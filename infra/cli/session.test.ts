import { afterEach, describe, expect, it } from 'vitest';
import { forgetOwnerKey, forgetSession, rememberedOwnerKey, rememberedPassphrase, rememberOwnerKey, rememberPassphrase } from './session';

afterEach(() => {
  forgetSession();
});

describe('session memory', () => {
  it('holds nothing until the operator typed something', () => {
    expect(rememberedPassphrase()).toBeUndefined();
    expect(rememberedOwnerKey()).toBeUndefined();
  });

  it('gives back the passphrase and the Owner API key it was handed', () => {
    rememberPassphrase('correct horse');
    rememberOwnerKey({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
    expect(rememberedPassphrase()).toBe('correct horse');
    expect(rememberedOwnerKey()).toEqual({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
  });

  it('drops the Owner API key alone, so a key that failed its validation is asked again while the passphrase stays', () => {
    rememberPassphrase('correct horse');
    rememberOwnerKey({ accessKey: 'SCWOWNER', secretKey: 'owner-secret' });
    forgetOwnerKey();
    expect(rememberedOwnerKey()).toBeUndefined();
    expect(rememberedPassphrase()).toBe('correct horse');
  });
});
