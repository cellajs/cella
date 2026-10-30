import { beforeAll, describe, expect, it } from 'vitest';
import { engineConfig } from '../config/engine-config';
import { appPrincipalNames, principalNames } from '../lib/scaleway/principals';
import { controlKey } from '../lib/stack/control-store';
import { checkpointKey } from '../lib/stack/pending-operations';
import { escapeRegExp } from '../lib/utils/escape-regexp';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;

beforeAll(async () => {
  h = await installPulumiMocks({ deferCompute: true });
  await import('./state-bucket-policy');
  await h.settle();
});

type Statement = { Principal: { SCW: string }; Action: string[]; Resource: string[] };

const glob = (pattern: string, value: string) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(value);

/** The principals a policy lets read one object, a version of it included. */
function readers(statements: readonly Statement[], object: string): string[] {
  return statements
    .filter((statement) => statement.Action.some((action) => glob(action, 's3:GetObject') || glob(action, 's3:GetObjectVersion')))
    .filter((statement) => statement.Resource.some((resource) => glob(resource, object)))
    .map((statement) => statement.Principal.SCW)
    .sort();
}

describe('the state bucket policy', () => {
  it("must not let a key outside the deploy path read a stack's checkpoint: the passphrase then guards it from nobody", () => {
    const policy = h.oneOfType('scaleway:object/bucketPolicy:BucketPolicy');
    const bucket = String(policy.inputs.bucket);
    const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
    const app = appPrincipalNames(engineConfig().appSlug);
    const deploy = `application_id:${principalNames(engineConfig().slug, 'production').ciDeploy}-id`;
    const operator = `application_id:${app.operator}-id`;
    expect(readers(Statement, `${bucket}/${checkpointKey('production')}`)).toEqual([deploy, operator].sort());
    // Positive control: the observer reads the rollout record beside it.
    expect(readers(Statement, `${bucket}/${controlKey('production')}`)).toEqual([deploy, `application_id:${app.observer}-id`, operator].sort());
  });
});
