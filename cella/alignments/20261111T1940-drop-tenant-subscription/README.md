---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: subscriptionId, subscriptionStatus, subscriptionPlan, subscription_status, c:subscription, c:trialing, c:paused, c:canceled
generate: true
---

# Tenants carry no subscription columns

The `tenants` table drops `subscriptionId`, `subscriptionStatus` and `subscriptionPlan`, with `subscriptionStatusValues`,
the `tenants_subscription_status_index`, the admin table's subscription column and the `c:subscription`, `c:trialing`,
`c:paused` and `c:canceled` keys. An app runs `pnpm generate` for the drop and removes its own uses of the three fields.

## What & why

No template code read the three columns: a system admin set them by hand and the admin tenants table showed a badge. A
billing provider (Paddle, Polar, Stripe) owns the subscription state and reports it by webhook. What a tenant may do
lives in `restrictions` and `status`, which the app's webhook handler writes. An app that bills stores the provider's
customer id in a column of its own.

## Blast radius

Breaking for an app that reads or writes the three fields or names a removed key; typecheck flags each use. The
migration drops data, so an app that set the columns copies them out first. `clientCacheVersion` is bumped: `Tenant`
lost a required property on the wire. No lens.

## Run

No script: manual.

## Manual steps

1. Before generating, count live rows that hold a value: `SELECT count(*) FROM tenants WHERE subscription_status <> 'none' OR subscription_id IS NOT NULL OR subscription_plan IS NOT NULL;`. A count above 0 is data the drop loses: copy it to an app-owned table first.
2. `pnpm generate` alone produces the migration: one `DROP INDEX` and three `DROP COLUMN` statements, with no rename question.
3. Remove the app's own reads and writes of `subscriptionId`, `subscriptionStatus` and `subscriptionPlan` (seeds, mocks, forms, drivers).
4. App code that names `c:subscription`, `c:trialing`, `c:paused` or `c:canceled` adds the key to `locales/*/app.json`.
5. An app that sets its own `clientCacheVersion` bumps it.

## Verify

```sh
pnpm generate
pnpm check
pnpm cella i18n unused
```
