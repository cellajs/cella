import { stripVTControlCharacters } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeSecretDefinition } from '../lib/runtime-secrets';
import { BACK, formatSecretsTable, manageRuntimeSecrets, secretsTable } from './manage-runtime-secrets';

const prompts = { select: vi.fn(), password: vi.fn(), confirm: vi.fn() };

const listSecretsUnder = vi.fn();
const getSecretByName = vi.fn();
const ensureSecret = vi.fn();
const putSecretValue = vi.fn();
const deleteSecret = vi.fn();
const provisionManagedKey = vi.fn();
const writeKey = vi.fn();
const log = vi.fn();

vi.mock('../lib/scaleway/scaleway-secret-manager', () => ({
  createSecretManagerClient: () => ({ listSecretsUnder, listSecretVersions: async () => [], getSecretByName, ensureSecret, putSecretValue, deleteSecret }),
}));

vi.mock('./provision-managed-key', () => ({ provisionManagedKey: (...args: unknown[]) => provisionManagedKey(...args) }));

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

const definition = (overrides: Partial<RuntimeSecretDefinition>): RuntimeSecretDefinition => ({
  id: 'x',
  secretName: 'x',
  description: '',
  envVar: 'X',
  required: false,
  valueSource: 'operator',
  generation: 'manual',
  services: ['backend'],
  ...overrides,
});

describe('secretsTable', () => {
  it.each([
    { state: 'missing · required', mark: '✖', secret: { required: true }, container: undefined },
    { state: 'empty · optional', mark: '○', secret: {}, container: { version_count: 0 } },
    { state: 'set Nov 8', mark: '●', secret: {}, container: { version_count: 2, setAt: '2026-11-08T12:00:00Z' } },
    { state: 'made by infra', mark: '◇', secret: { valueSource: 'engine', generation: 'random', rotatable: true }, container: undefined },
    { state: 'made by infra · kept', mark: '◇', secret: { valueSource: 'engine', generation: 'random' }, container: undefined },
  ] as const)('reads $state', ({ state, mark, secret, container }) => {
    const rows = secretsTable([definition(secret)], new Map(container ? [['x', container]] : []));

    expect(rows.map((row) => row.state)).toEqual([state]);
    expect(stripVTControlCharacters(formatSecretsTable(rows)[1] ?? '')).toMatch(new RegExp(`^${mark} X +backend +${state}$`));
  });

  it('puts required values without a version first, then set ones, then optional ones, then the ones infra makes, in registry order', () => {
    const rows = secretsTable(
      [
        definition({ envVar: 'ENGINE', secretName: 'engine', valueSource: 'engine' }),
        definition({ envVar: 'SET', secretName: 'set' }),
        definition({ envVar: 'OPTIONAL', secretName: 'optional' }),
        definition({ envVar: 'REQUIRED_A', secretName: 'required-a', required: true }),
        definition({ envVar: 'REQUIRED_B', secretName: 'required-b', required: true }),
      ],
      new Map([['set', { version_count: 1 }]]),
    );

    expect(rows.map((row) => row.envVar)).toEqual(['REQUIRED_A', 'REQUIRED_B', 'SET', 'OPTIONAL', 'ENGINE']);
  });

  it('aligns the state column under its header', () => {
    const rows = secretsTable(
      [definition({ envVar: 'A_LONGER_NAME', services: ['backend', 'mcp'] }), definition({ envVar: 'B', required: true })],
      new Map(),
    );
    const lines = formatSecretsTable(rows).map((line) => stripVTControlCharacters(line));
    const header = lines[0] ?? '';

    expect(lines.slice(1).map((line, index) => line.indexOf(rows[index]?.state ?? ''))).toEqual([header.indexOf('STATE'), header.indexOf('STATE')]);
  });
});

describe('manageRuntimeSecrets', () => {
  it('reads the table before any key is asked, and asks for the operator key once, at the first write', async () => {
    prompts.select
      .mockResolvedValueOnce('brevoApiKey')
      .mockResolvedValueOnce('set')
      .mockResolvedValueOnce('githubClientSecret')
      .mockResolvedValueOnce('set')
      .mockResolvedValueOnce(BACK);
    prompts.password.mockResolvedValueOnce('  new-api-key ').mockResolvedValueOnce('gh-secret');

    await expect(manageRuntimeSecrets(baseOptions)).resolves.toEqual({ changed: true });

    expect(listSecretsUnder).toHaveBeenCalledWith('/runtime/');
    expect(listSecretsUnder.mock.invocationCallOrder[0]).toBeLessThan(writeKey.mock.invocationCallOrder[0] ?? 0);
    expect(writeKey).toHaveBeenCalledTimes(1);
    expect(ensureSecret).not.toHaveBeenCalled();
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'c-brevo', value: 'new-api-key' }));
    expect(putSecretValue).toHaveBeenCalledWith(expect.objectContaining({ secretId: 'c-gh', value: 'gh-secret' }));
  });

  it('refuses to create a missing container, asks for no key and tells the operator to apply first', async () => {
    listSecretsUnder.mockResolvedValue([]);
    prompts.select.mockResolvedValueOnce('brevoApiKey').mockResolvedValueOnce('set').mockResolvedValueOnce(BACK);

    await expect(manageRuntimeSecrets(baseOptions)).resolves.toEqual({ changed: false });

    // Creating the container out-of-band would make the next `pulumi up` 409.
    expect(ensureSecret).not.toHaveBeenCalled();
    expect(putSecretValue).not.toHaveBeenCalled();
    expect(prompts.password).not.toHaveBeenCalled();
    expect(writeKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Apply first'));
  });

  it('prints the table without a pick under --defaults or without a TTY', async () => {
    await expect(manageRuntimeSecrets({ ...baseOptions, pick: false })).resolves.toEqual({ changed: false });

    expect(prompts.select).not.toHaveBeenCalled();
    expect(writeKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/ADMIN_EMAIL.*missing · required/));
  });

  it('deletes an entire secret object only after confirmation', async () => {
    prompts.select.mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('delete').mockResolvedValueOnce(BACK);
    prompts.confirm.mockResolvedValueOnce(true);

    await manageRuntimeSecrets(baseOptions);

    expect(deleteSecret).toHaveBeenCalledWith('c-gh');
  });

  it('cancels deletion when confirmation is declined', async () => {
    prompts.select.mockResolvedValueOnce('githubClientSecret').mockResolvedValueOnce('delete').mockResolvedValueOnce(BACK);
    prompts.confirm.mockResolvedValueOnce(false);

    await manageRuntimeSecrets(baseOptions);

    expect(deleteSecret).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Deletion cancelled'));
  });

  it('rotates the Yjs token key together with the public key derived from it', async () => {
    prompts.select.mockResolvedValueOnce('yjsTokenPrivateKey').mockResolvedValueOnce('rotate').mockResolvedValueOnce(BACK);
    prompts.confirm.mockResolvedValueOnce(true);
    getSecretByName.mockImplementation(async (name: string) => ({ id: name, name, path: '/runtime', version_count: 1 }));

    await expect(manageRuntimeSecrets(baseOptions)).resolves.toEqual({ changed: true });

    expect(putSecretValue.mock.calls.map(([input]) => input.secretId)).toEqual(['yjs-token-private-key', 'yjs-token-public-key']);
  });

  it('mints a managed key after confirmation, passing the caller identity through', async () => {
    prompts.select.mockResolvedValueOnce('scwAiApiKey').mockResolvedValueOnce('mint').mockResolvedValueOnce(BACK);
    prompts.confirm.mockResolvedValueOnce(true);
    provisionManagedKey.mockResolvedValueOnce({ applicationId: 'app-ai', seeded: { 'scw-ai-api-key': 1 } });

    await manageRuntimeSecrets(baseOptions);

    expect(provisionManagedKey).toHaveBeenCalledWith(
      expect.objectContaining({ callerSecretKey: 'caller-secret', projectId: 'proj-1', slug: 'demo' }),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Minted'));
  });

  it('does not mint when the confirmation is declined', async () => {
    prompts.select.mockResolvedValueOnce('scwAiApiKey').mockResolvedValueOnce('mint').mockResolvedValueOnce(BACK);
    prompts.confirm.mockResolvedValueOnce(false);

    await manageRuntimeSecrets(baseOptions);

    expect(provisionManagedKey).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Mint cancelled'));
  });
});
