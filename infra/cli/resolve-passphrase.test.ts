import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const maskedSecret = vi.fn();
vi.mock('./prompts/masked-secret', () => ({ maskedSecret: (...args: unknown[]) => maskedSecret(...args) }));
// A stack verifies the passphrase its yaml names after `passphrase=`, so a test rotates one by handing a second yaml.
vi.mock('../lib/stack/pulumi-passphrase', () => ({
  generatePassphrase: () => 'generated',
  verifyStackPassphrase: (yaml: string, passphrase: string) => yaml.includes(`passphrase=${passphrase}\n`),
}));

const { resolveVerifiedPassphrase } = await import('./shared');
const { forgetSession, setPassphraseCustody } = await import('./session');

const stack = (passphrase: string) => `encryptionsalt: v1:abc\n# passphrase=${passphrase}\n`;
const custody = (stored: string | undefined, canStore = true) => {
  const read = vi.fn(async () => stored);
  const store = vi.fn(async () => canStore);
  setPassphraseCustody({ read, store });
  return { read, store };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
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

  it('must not take the passphrase from the environment: a value on disk would run the CLI with nobody at the prompt', async () => {
    vi.stubEnv('PULUMI_CONFIG_PASSPHRASE', 'first');
    maskedSecret.mockResolvedValue('first');

    await resolveVerifiedPassphrase(stack('first'));

    expect(maskedSecret).toHaveBeenCalledTimes(1);
  });
});

describe('resolveVerifiedPassphrase with the passphrase in Secret Manager', () => {
  it('fetches it, so nobody types it, and reads Secret Manager once per run', async () => {
    const { read } = custody('first');

    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');
    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');

    expect(maskedSecret).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('asks once on a stack that stored none yet, and stores what was typed', async () => {
    const { store } = custody(undefined);
    maskedSecret.mockResolvedValue('first');

    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');

    expect(store).toHaveBeenCalledWith('first');
  });

  it('must not use a stored passphrase that does not open the stack: it asks, and stores the one that does', async () => {
    const { store } = custody('stale');
    maskedSecret.mockResolvedValue('first');

    await expect(resolveVerifiedPassphrase(stack('first'))).resolves.toBe('first');

    expect(maskedSecret).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith('first');
  });

  it('must not store a passphrase the stack refused', async () => {
    const { store } = custody(undefined);
    maskedSecret.mockResolvedValueOnce('wrong').mockResolvedValueOnce('first');

    await resolveVerifiedPassphrase(stack('first'));

    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith('first');
  });

  it('fetches again after a rotation made the remembered passphrase stale', async () => {
    const first = custody('old');
    await resolveVerifiedPassphrase(stack('old'));
    const second = custody('new');

    await expect(resolveVerifiedPassphrase(stack('new'))).resolves.toBe('new');

    expect(first.read).toHaveBeenCalledTimes(1);
    expect(second.read).toHaveBeenCalledTimes(1);
    expect(maskedSecret).not.toHaveBeenCalled();
  });
});
