---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: Set up operator key, dedicated address, ip-lock, ipCondition, ipAllowed, acquirePrivilegedKey, setupOperatorApp, setup-operator-app, OperatorLock, operatorLock, formatOperatorLine, publicAddress
---

# One-day operator keys, no address lock

Run **Set up operators** (`pnpm infra operator-key`) once per app with an Owner API key: it rewrites the `<app>-operator` policy without its address condition and makes the `<app>-operators` group with a policy of its own. The rewrite takes the address condition off, so the old durable operator key works from every address until it is revoked: revoke it in the console at once. From then on, make a one-day key of the operator application at each sitting, or use your own as a group member.

## What & why

The operator key was a durable key of `<app>-operator`, held to a dedicated address by an IAM condition. A session now takes only a key that ends within a day, of the operator application or of a user in `<app>-operators`, from any address, and the bucket policies admit the members. Gone: `ip-lock.ts`, the address prompt and header lines, `acquirePrivilegedKey` (`acquireOperatorKey`), `setupOperatorApp` (`setupOperators`), `OperatorLock`. A leaked key dies within the day, and a leaver is removed from the group.

## Blast radius

Every app with a deployed environment: one Owner moment per app, then a console step per sitting. No database, cache or lens change. App code that imported `infra/lib/scaleway/ip-lock.ts`, `acquirePrivilegedKey` or `tasks/setup-operator-app` fails typecheck; an app that never touched `infra/cli` has only the steps below.

## Run

No script: manual.

## Manual steps

1. `pnpm infra operator-key --mode <env>` with an Owner API key that expires within hours: it rewrites `<app>-operator-policy` in place and makes `<app>-operators` with `<app>-operators-policy`.
2. At once, in the console: delete the durable key of `<app>-operator` (IAM → Applications → `<app>-operator` → API keys), which works from every address since step 1, and drop it from the password manager. **Set up the runner** rewrites the policy the same way and prints the same notice.
3. At each sitting, make a one-day key there (Generate API key, with an expiration), or add yourself to `<app>-operators` (IAM → Groups) and use a one-day key of your own user.
4. `pnpm infra apply --mode <env>` on that key in each environment, so every bucket policy names the members; a member's own key reaches the buckets from the next apply on.
5. Runbooks or notes of the app that name the dedicated address or **Set up operator key** drop them.

## Verify

```sh
pnpm check
pnpm --filter infra exec vitest run
pnpm infra status --mode <env>
```
