import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ESCAPED } from '../prompts/menu-select';
import { secretsMenu } from './secrets';

const prompts = { select: vi.fn(), password: vi.fn(), confirm: vi.fn(), input: vi.fn() };

const listSecretsUnder = vi.fn();
const getSecretByName = vi.fn();
const ensureSecret = vi.fn();
const putSecretValue = vi.fn();
const deleteSecret = vi.fn();
const provisionManagedKey = vi.fn();
const writeKey = vi.fn();
const log = vi.fn();

vi.mock('../../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({
    listSecretsUnder,
    listSecretVersions: async () => [],
    getSecretByName,
    ensureSecret,
    putSecretValue,
    deleteSecret,
  }),
}));

vi.mock('../../tasks/provision-managed-key', () => ({ provisionManagedKey: (...args: unknown[]) => provisionManagedKey(...args) }));

const listed = [
  { id: 'c-admin', name: 'admin-email', path: '/runtime', version_count: 0 },
  { id: 'c-brevo', name: 'brevo-api-key', path: '/runtime', version_count: 1 },
  { id: 'c-gh', name: 'github-client-secret', path: '/runtime', version_count: 0 },
  { id: 'c-yjs', name: 'yjs-token-private-key', path: '/runtime', version_count: 1 },
];

const baseOptions = {
  readKey: 'observer-secret',
  writeKey,
  identityKey: async () => ({ secretKey: 'caller-secret', organizationId: 'org-1' }),
  projectId: 'proj-1',
  region: 'nl-ams',
  slug: 'demo',
  mode: 'production',
  pick: true,
  prompts,
  log,
};

beforeEach(() => {
  vi.resetAllMocks();
  listSecretsUnder.mockResolvedValue(listed);
  putSecretValue.mockResolvedValue({ revision: 7 });
  writeKey.mockResolvedValue('operator-secret');
});

/** A `.env` file in a fresh folder, its path. */
function envFile(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'secrets-import-')), '.env');
  writeFileSync(path, text);
  return path;
}

describe('secretsMenu', () => {
  it('reads the table before any key is asked, and asks for the operator key once, at the first write', async () => {
    prompts.select
      .mockResolvedValueOnce('brevoApiKey')
      .mockResolvedValueOnce('set')
      .mockResolvedValueOnce('githubClientSecret')
      .mockResolvedValueOnce('set')
      .mockResolvedValueOnce(ESCAPED);
    prompts.password.mockResolvedValueOnce('  new-api-key ').mockResolvedValueOnce('gh-secret');

    await expect(secretsMenu(baseOptions)).resolves.toEqual({ changed: true });

    expect(listSecretsUnder).toHaveBeenCalledWith('/runtime/');
    expect(listSecretsUnder.mock.invocationCallOrder[0]).toBeLessThan(writeKey.mock.invocationCallOrder[0] ?? 0);
    expect(writeKey).toHaveBeenCalledTimes(1);
    expect(ensureSecret).not.toHaveBeenCalled();
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'c-brevo', value: 'new-api-key' }));
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'c-gh', value: 'gh-secret' }));
  });

  it('refuses to create a missing container, asks for no key and tells the operator to apply first', async () => {
    listSecretsUnder.mockResolvedValue([]);
    prompts.select.mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('set').mockResolvedValueOnce(ESCAPED);

    await expect(secretsMenu(baseOptions)).resolves.toEqual({ changed: false });

    // Creating the container out-of-band would make the next `pulumi up` 409.
    expect(ensureSecret).not.toHaveBeenCalled();
    expect(putSecretValue).not.toHaveBeenCalled();
    expect(prompts.password).not.toHaveBeenCalled();
    expect(writeKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Apply first'));
  });

  it('prints the table without a pick under --defaults or without a TTY, below the notice', async () => {
    const notice = 'A deploy of aaaaaaaaaa waits for ADMIN_EMAIL: setting them starts it again.';

    await expect(secretsMenu({ ...baseOptions, pick: false, notice: Promise.resolve(notice) })).resolves.toEqual({ changed: false });

    expect(prompts.select).not.toHaveBeenCalled();
    expect(writeKey).not.toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toBe(notice);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_EMAIL.*missing · required/));
  });

  it('deletes an entire secret object only after confirmation', async () => {
    prompts.select.mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('delete').mockResolvedValueOnce(ESCAPED);
    prompts.confirm.mockResolvedValueOnce(true);

    await secretsMenu(baseOptions);

    expect(deleteSecret).toHaveBeenCalledWith('c-gh');
  });

  it('cancels deletion when confirmation is declined', async () => {
    prompts.select.mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('delete').mockResolvedValueOnce(ESCAPED);
    prompts.confirm.mockResolvedValueOnce(false);

    await secretsMenu(baseOptions);

    expect(deleteSecret).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Deletion cancelled'));
  });

  it('rotates the Yjs token key together with the public key derived from it', async () => {
    prompts.select.mockResolvedValueOnce('yjsTokenPrivateKey').mockResolvedValueOnce('rotate').mockResolvedValueOnce(ESCAPED);
    prompts.confirm.mockResolvedValueOnce(true);
    getSecretByName.mockImplementation(async (name: string) => ({ id: name, name, path: '/runtime', version_count: 1 }));

    await expect(secretsMenu(baseOptions)).resolves.toEqual({ changed: true });

    expect(putSecretValue.mock.calls.map(([input]) => input.secretId)).toEqual(['yjs-token-private-key', 'yjs-token-public-key']);
  });

  it('mints a managed key after confirmation, passing the caller identity through', async () => {
    prompts.select.mockResolvedValueOnce('scwAiApiKey').mockResolvedValueOnce('mint').mockResolvedValueOnce(ESCAPED);
    prompts.confirm.mockResolvedValueOnce(true);
    provisionManagedKey.mockResolvedValueOnce({ applicationId: 'app-ai', seeded: { 'scw-ai-api-key': 1 } });

    await secretsMenu(baseOptions);

    expect(provisionManagedKey).toHaveBeenCalledWith(
      expect.objectContaining({ callerSecretKey: 'caller-secret', projectId: 'proj-1', slug: 'demo' }),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Minted'));
  });

  it('does not mint when the confirmation is declined', async () => {
    prompts.select.mockResolvedValueOnce('scwAiApiKey').mockResolvedValueOnce('mint').mockResolvedValueOnce(ESCAPED);
    prompts.confirm.mockResolvedValueOnce(false);

    await secretsMenu(baseOptions);

    expect(provisionManagedKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Mint cancelled'));
  });

  it('imports a .env file after one confirmation: each matched value on the operator key, one with no container left to the apply', async () => {
    const path = envFile(
      '# app values\nexport BREVO_API_KEY="xkeysib-abc"\nGITHUB_CLIENT_SECRET=gh-secret\nSCW_AI_API_KEY=scw-key\nCOOKIE_SECRET=dev\nFOO=bar\n',
    );
    prompts.select.mockResolvedValueOnce('import-env-file').mockResolvedValueOnce(ESCAPED);
    prompts.input.mockResolvedValueOnce(path);
    prompts.confirm.mockResolvedValueOnce(true);

    await expect(secretsMenu(baseOptions)).resolves.toEqual({ changed: true });

    const logged = log.mock.calls.map(([line]) => stripVTControlCharacters(String(line)));
    expect(logged).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/BREVO_API_KEY +set \(11 chars\)/),
        expect.stringMatching(/COOKIE_SECRET +made by infra/),
        expect.stringMatching(/FOO +no such env var/),
        expect.stringContaining('SCW_AI_API_KEY has no secret in Secret Manager yet'),
        expect.stringContaining('Set 2 of 3 values'),
      ]),
    );
    expect(prompts.confirm.mock.calls).toEqual([[expect.objectContaining({ default: false })]]);
    expect(writeKey).toHaveBeenCalledTimes(1);
    expect(putSecretValue.mock.calls.map(([input]) => [input.secretId, input.value])).toEqual([
      ['c-brevo', 'xkeysib-abc'],
      ['c-gh', 'gh-secret'],
    ]);
  });

  it('writes nothing and asks for no key when the import is declined', async () => {
    prompts.select.mockResolvedValueOnce('import-env-file').mockResolvedValueOnce(ESCAPED);
    prompts.input.mockResolvedValueOnce(envFile('BREVO_API_KEY=xkeysib-abc\n'));
    prompts.confirm.mockResolvedValueOnce(false);

    await expect(secretsMenu(baseOptions)).resolves.toEqual({ changed: false });

    expect(writeKey).not.toHaveBeenCalled();
    expect(putSecretValue).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Import cancelled'));
  });
});
