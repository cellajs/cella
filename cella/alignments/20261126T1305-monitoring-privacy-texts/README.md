---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: error_data, features.gdpr_legal.text, stack.opentelemetry.text, features.eu_cloud.text
---

# The privacy policy says what the browser and the servers send to monitoring

Rewrite the `error_data` row of the app's own `legal-config.ts` as cella's reads. An app that edited
`privacy-text.tsx` adds its paragraph on the servers' records and takes its monitoring item of the cookies list. The
app's `about.json` takes three sentences where it kept the template's.

## What & why

`privacy-text.tsx` gains a paragraph on what the servers export over OTLP: request records with route, address
without secrets, user agent, user id, the organization's and tenant's ids and names and the page load's session id,
and log lines with the user id and the sign-in session's id. The monitoring item names the user id on errors and the
session id on API requests, and the `error_data` row lists these categories. The old texts left most of this out.

## Blast radius

Every app with legal texts of its own. `legal-config.ts` and `about.json` are app-owned: an upgrade never changes
them. A `privacy-text.tsx` the app never edited arrives changed. No code, database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Not caught by the compiler. `frontend/src/modules/marketing/legal/legal-config.ts`: the `error_data` row takes cella's `purpose`, `dataCategories` and `storageLocation`.
2. Not caught by the compiler. An app that edited `privacy-text.tsx` adds the paragraph on the servers' records after the backup paragraph of `how-we-use-data`, and takes the monitoring item of `cookies`, each fitted to what its own senders add.
3. Not caught by the compiler. `shared/locales/en/about.json`: `features.gdpr_legal.text`, `stack.opentelemetry.text` and `features.eu_cloud.text` take cella's wording where the app kept the template's.
4. No step: `cella/docs/OTEL.md` names a request span's path, query and user agent, a query's text without its values, and the request log line's path, user id and sign-in session id.

## Verify

```sh
git grep -n -e 'Our error monitoring service' -e 'every processor' -e 'from the browser, API and workers'
pnpm check
```

The grep prints nothing once the texts are rewritten. By hand: `/legal/privacy` shows the servers' paragraph under
"Data we process", and with a DSN set, the monitoring item under "Cookies and storage".
