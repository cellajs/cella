---
syncBreaking: true
clientCacheBump: false
caughtBy: nothing
grep: --rotate-key
---

# Each environment owes an apply, Rotate keys covers the runner, and Owner keys must expire within a day

Each environment runs an apply once: the main job's definition gains its release check (`RELEASES_ONLY=1` where the environment follows the releases), and the state keeps every machine's user data under the passphrase. `pnpm infra runner-identity --rotate-key` is gone: **Rotate keys** replaces the runner key and the runner machine. Every Owner moment refuses an Owner API key without an expiry or with more than a day left. After the first deploy that follows the apply, **Rotate keys** once per environment.

## What & why

The engine now states and watches what the runner reaches: the inventory compares the main job's whole definition, and Show runs flags a run started with its own values. Production's job script refuses a commit no release names. A missing required secret blocks a deploy before any machine exists. The provider kept each machine's user data, boot key included, unencrypted in the state; the state now encrypts it, and each deploy takes the key out of user data once a machine booted.

## Blast radius

Every app with a deployed stack. Sync-breaking for operations: an environment's deploys end blocked until its apply ran. A script or runbook that calls `runner-identity --rotate-key` stops working, and so does an Owner API key without an expiry. No database, cache or wire change.

## Run

No script: manual.

## Manual steps

1. Per environment, at the dedicated address: `pnpm infra apply --mode <env>` (operator key). It writes the main job's new definition and rewrites every machine's user data in the state under the passphrase; it starts a blocked target again.
2. Make every Owner API key with an expiry of hours (console → your user → API keys), revoke any Owner key that lives longer, and remove one kept in `infra/.env.<mode>`.
3. Replace `pnpm infra runner-identity --rotate-key` in scripts and runbooks with `pnpm infra rotate-keys --mode <env>`, which replaces the runner key and machine where the runner serves that environment.
4. Per environment, once the first deploy after step 1 has run: `pnpm infra rotate-keys --mode <env>` (Owner API key, then operator key). Until then the state bucket's history held the boot key unencrypted, and every machine's user data held it, so the rotation makes each copy a dead key.

## Verify

```sh
pnpm infra status --mode production
pnpm infra runs --mode production
pnpm check
```
