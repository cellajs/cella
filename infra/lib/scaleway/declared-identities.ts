import type { EngineConfig } from '../../config/engine-config';
import { appStorageNeeds, services } from '../services';
import { deployPolicy } from './deploy-policy';
import { UPLOADS_PERMISSION_SETS } from './permissions';
import { principalNames, principalTags } from './principals';
import type { PolicyRule } from './scaleway-iam';

/** One policy as it must be: the identity it belongs to, and its rules. */
export interface DeclaredPolicy {
  name: string;
  /** The IAM application the policy grants to. */
  applicationName: string;
  description: string;
  rules: PolicyRule[];
  tags: string[];
}

/** What an Owner moment writes for one environment: the applications, and the policy of each. */
export interface DeclaredIdentities {
  applications: string[];
  policies: DeclaredPolicy[];
}

/** The uploads application's policy: object rights in the project, which only the upload buckets' policies admit. */
export function uploadsPolicy(opts: { slug: string; mode: string; projectId: string }): DeclaredPolicy {
  const names = principalNames(opts.slug, opts.mode);
  return {
    name: `${names.uploads}-policy`,
    applicationName: names.uploads,
    description: "Object access on the upload buckets, for the backend's uploads and presigned URLs (written at Owner moments)",
    rules: [{ permission_set_names: [...UPLOADS_PERMISSION_SETS], project_ids: [opts.projectId] }],
    tags: principalTags(opts.slug, opts.mode),
  };
}

/**
 * Whether the registry declares an uploads application: a service signs uploads, so the upload buckets exist. Registry-derived, as the
 * buckets are, so `enabled` and `singleVM` never touch IAM.
 */
export function declaresUploads(): boolean {
  return appStorageNeeds(services).uploadBuckets;
}

/** Every identity an environment's code declares: the deploy key and, with upload buckets, the uploads application, with their policies. */
export function declaredIdentities(
  appConfig: Pick<EngineConfig, 'slug' | 'mode'>,
  ids: { projectId: string; organizationId: string },
): DeclaredIdentities {
  const { slug, mode } = appConfig;
  const names = principalNames(slug, mode);
  const uploads = declaresUploads();
  return {
    applications: [names.ciDeploy, ...(uploads ? [names.uploads] : [])],
    policies: [deployPolicy({ slug, mode, ...ids }), ...(uploads ? [uploadsPolicy({ slug, mode, projectId: ids.projectId })] : [])],
  };
}

/** A rule in a form two rules compare by: sets and projects in order, an absent condition as empty. */
function ruleKey(rule: {
  permission_set_names?: readonly string[];
  project_ids?: readonly string[];
  organization_id?: string | null;
  condition?: string | null;
}): string {
  return JSON.stringify([
    [...(rule.permission_set_names ?? [])].sort(),
    [...(rule.project_ids ?? [])].sort(),
    rule.organization_id ?? '',
    rule.condition ?? '',
  ]);
}

/** True when the live rules grant exactly what the wanted ones do, in any order. */
export function sameRules(live: readonly Parameters<typeof ruleKey>[0][], wanted: readonly PolicyRule[]): boolean {
  const a = live.map(ruleKey).sort();
  const b = wanted.map(ruleKey).sort();
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
