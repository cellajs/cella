import { beforeAll, describe, expect, it } from 'vitest';
import type { EngineConfig } from '../config/engine-config';
import { appPrincipalNames, principalNames } from '../lib/scaleway/principals';
import { checkpointKey } from '../lib/stack/pending-operations';
import { escapeRegExp } from '../lib/utils/escape-regexp';
import { installPulumiMocks, type MockHarness } from '../tests/helpers/pulumi-mock';

let h: MockHarness;
let appConfig: EngineConfig;

beforeAll(async () => {
  h = await installPulumiMocks();
  ({ engineConfig: appConfig } = await import('../config/engine-config'));
  await import('./state-bucket-policy');
  await h.settle();
});

type Statement = { Principal: { SCW: string | string[] }; Action: string[]; Resource: string[] };

const glob = (pattern: string, value: string) => new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(value);

/** The principals a policy lets read one object, a version of it included. */
function readers(statements: readonly Statement[], object: string): string[] {
  return statements
    .filter((statement) => statement.Action.some((action) => glob(action, 's3:GetObject') || glob(action, 's3:GetObjectVersion')))
    .filter((statement) => statement.Resource.some((resource) => glob(resource, object)))
    .flatMap((statement) => [statement.Principal.SCW].flat())
    .sort();
}

describe('the state bucket policy', () => {
  it("must not let the deploy key or the observer read a stack's checkpoint: only the people who apply read the state", () => {
    const policy = h.oneOfType('scaleway:object/bucketPolicy:BucketPolicy');
    const bucket = String(policy.inputs.bucket);
    const { Statement } = JSON.parse(String(policy.inputs.policy)) as { Statement: Statement[] };
    const app = appPrincipalNames(appConfig.appSlug);
    const operators = [`application_id:${app.operator}-id`, `user_id:${app.operators}-member-id`];
    expect(readers(Statement, `${bucket}/${checkpointKey('production')}`)).toEqual(operators.sort());
    expect(JSON.stringify(Statement)).not.toContain(principalNames(appConfig.slug, 'production').ciDeploy);
    // Positive control: the observer may list it, to tell the bucket is there, and read nothing in it.
    const observer = Statement.find((statement) => [statement.Principal.SCW].flat().includes(`application_id:${app.observer}-id`));
    expect(observer?.Action).toEqual(['s3:ListBucket']);
  });
});
