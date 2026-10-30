# infra/lib/scaleway

The Scaleway API calls the engine makes, and what each key may do.

| Group | Files |
| --- | --- |
| Identities and rights | [principals.ts](./principals.ts) names them, [declared-identities.ts](./declared-identities.ts) lists what an environment declares, [permissions.ts](./permissions.ts) and [deploy-policy.ts](./deploy-policy.ts) the deploy key's rules, [machine-policies.ts](./machine-policies.ts), [machine-keys.ts](./machine-keys.ts), [policy-reach.ts](./policy-reach.ts) and [ip-lock.ts](./ip-lock.ts) the rest |
| Keys at hand | [operator-identity.ts](./operator-identity.ts), [provider-env.ts](./provider-env.ts) |
| API clients | [scw-fetch.ts](./scw-fetch.ts), [iam-client.ts](./iam-client.ts), [scaleway-iam.ts](./scaleway-iam.ts), [scaleway-account.ts](./scaleway-account.ts), [scaleway-rdb.ts](./scaleway-rdb.ts), [scaleway-secret-manager.ts](./scaleway-secret-manager.ts), [s3-client.ts](./s3-client.ts), [machines.ts](./machines.ts) |
| Secrets | [secret-paths.ts](./secret-paths.ts): the folders, which are the boundary IAM conditions read; [secret-copies.ts](./secret-copies.ts): one copy per consumer; [db-privileges.ts](./db-privileges.ts): the database roles |
| Images | [registry-digest.ts](./registry-digest.ts), [release-image.ts](./release-image.ts) |
| DNS | [ensure-dns-zone.ts](./ensure-dns-zone.ts), [dns-zone-project.ts](./dns-zone-project.ts) |

**DNS zone.** The setup writes records only in an active Scaleway DNS zone. A domain registered elsewhere becomes one once the TXT challenge Scaleway emails resolves at its current DNS provider and its NS records point at Scaleway; the setup registers the domain and rechecks until then.
