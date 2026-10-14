import type { DeclaredIdentities } from '../scaleway/declared-identities';

/** What one environment's code declares that only an Owner moment or an apply writes (tasks/privileged-footprint.ts renders it). */
export interface PrivilegedFootprint {
  environment: string;
  identities: DeclaredIdentities;
  resources: Array<{ type: string; name: string; inputs: Record<string, unknown> }>;
}

/** What merging a change owes in one environment: an Owner moment for its identities, an apply for its privileged resources. */
export interface OwedWork {
  environment: string;
  /** Applications and policies that are new, gone or changed: **Update identities**, with an Owner API key. */
  ownerMoment: string[];
  /** Privileged resources that are new, gone or changed: an apply, on the operator key. */
  apply: string[];
}

/** JSON with object keys in a fixed order, so two renders of the same value compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/** Each key's change between two maps: `+ key` new, `- key` gone, `~ key` changed. */
function changes(base: Map<string, string>, head: Map<string, string>): string[] {
  const lines: string[] = [];
  for (const [key, value] of head) {
    if (!base.has(key)) lines.push(`+ ${key}`);
    else if (base.get(key) !== value) lines.push(`~ ${key}`);
  }
  for (const key of base.keys()) if (!head.has(key)) lines.push(`- ${key}`);
  return lines.sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
}

/** Compare a base's footprint with a head's: what the change owes, by kind. */
export function owedWork(base: PrivilegedFootprint, head: PrivilegedFootprint): OwedWork {
  const applications = (footprint: PrivilegedFootprint) => new Map(footprint.identities.applications.map((name) => [`application ${name}`, '']));
  const policies = (footprint: PrivilegedFootprint) =>
    new Map(footprint.identities.policies.map((policy) => [`policy ${policy.name}`, canonical({ ...policy, rules: policy.rules })]));
  const resources = (footprint: PrivilegedFootprint) =>
    new Map(footprint.resources.map((resource) => [`${resource.type} ${resource.name}`, canonical(resource.inputs)]));
  return {
    environment: head.environment,
    ownerMoment: [...changes(applications(base), applications(head)), ...changes(policies(base), policies(head))],
    apply: changes(resources(base), resources(head)),
  };
}

/** The lines the pull request shows for one environment. */
export function owedWorkLines(owed: OwedWork): string[] {
  if (owed.ownerMoment.length === 0 && owed.apply.length === 0) return [`**${owed.environment}:** nothing only an operator writes changes.`];
  return [
    ...(owed.ownerMoment.length > 0
      ? [
          `**${owed.environment} needs an Owner moment** (\`pnpm infra identity\`, with an Owner API key) before its next deploy:`,
          ...owed.ownerMoment.map((line) => `- \`${line}\``),
        ]
      : []),
    ...(owed.apply.length > 0
      ? [
          `**${owed.environment} needs an apply** (\`pnpm infra apply\`, on the operator key) before its next deploy:`,
          ...owed.apply.map((line) => `- \`${line}\``),
        ]
      : []),
  ];
}
