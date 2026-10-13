import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const maskedSecret = vi.fn();
vi.mock('./prompts/masked-secret', () => ({ maskedSecret: (...args: unknown[]) => maskedSecret(...args) }));
// A stack verifies the passphrase its yaml names after `passphrase=`, so a test rotates one by handing a second yaml.
vi.mock('../lib/stack/pulumi-passphrase', () => ({
  generatePassphrase: () => 'generated',
  verifyStackPassphrase: (yaml: string, passphrase: string) => yaml.includes(`passphrase=${passphrase}\n`),
}));

const { resolveVerifiedPassphrase } = await import('./shared');
const { forgetSession } = await import('./session');

const stack = (passphrase: string) => `encryptionsalt: v1:abc\n# passphrase=${passphrase}\n`;

beforeEach(() => {
  vi.stubEnv('PULUMI_CONFIG_PASSPHRASE', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  forgetSession();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('resolveVerifiedPassphrase in one run of the CLI', () => {
  it('asks once: the second action gets the passphrase typed for the first', async () => {
    maskedSecret.mockResolvedValue('first');

    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');
    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');

    expect(maskedSecret).toHaveBeenCalledTimes(1);
  });

  it('must not keep a passphrase the stack refused', async () => {
    maskedSecret.mockResolvedValueOnce('wrong').mockResolvedValueOnce('first');

    await resolveVerifiedPassphrase(stack('first'));
    expect(maskedSecret).toHaveBeenCalledTimes(2);

    // Only the verified one was kept: a stack that takes `wrong` asks again.
    maskedSecret.mockResolvedValueOnce('wrong');
    await expect(resolveVerifiedPassphrase(stack('wrong'))).resolves.toBe('wrong');
    expect(maskedSecret).toHaveBeenCalledTimes(3);
  });

  it('asks again after a rotation: the remembered passphrase no longer opens the stack', async () => {
    maskedSecret.mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    await resolveVerifiedPassphrase(stack('old'));
    await expect(resolveVerifiedPassphrase(stack('new'))).resolves.toBe('new');

    expect(maskedSecret).toHaveBeenCalledTimes(2);
  });

  it('takes a matching passphrase from the environment without asking or remembering it', async () => {
    vi.stubEnv('PULUMI_CONFIG_PASSPHRASE', 'first');

    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');
    expect(maskedSecret).not.toHaveBeenCalled();

    vi.stubEnv('PULUMI_CONFIG_PASSPHRASE', undefined);
    maskedSecret.mockResolvedValue('first');
    await resolveVerifiedPassphrase(stack('first'));
    expect(maskedSecret).toHaveBeenCalledTimes(1);
  });
});
