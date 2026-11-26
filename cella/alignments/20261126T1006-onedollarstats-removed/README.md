---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: onedollarstats, One Dollar Stats, page_visits
---

# The template counts no page views: `onedollarstats` leaves the frontend and its CSP

`frontend/src/modules/common/root.tsx` starts no page-view collector, and the frontend CSP drops
`*.onedollarstats.com`. Drop `onedollarstats` from `frontend/package.json`, and rewrite the app's own privacy and legal
texts and about page where they say page visits are counted. Apply every deployed environment before its next deploy.

## What & why

`root.tsx` no longer calls `configure` of `onedollarstats`, which sent a `PageView` for each new path to
`collector.onedollarstats.com`. `frontend/package.json` drops the package, `infra/config/frontend-csp.config.ts` drops
`*.onedollarstats.com` from `connect-src`, and the template's privacy policy, subprocessor list and about page no longer
say page visits are counted. The template names no analytics vendor: an app that counts visits chooses and declares
its own.

## Blast radius

Every app that kept the collector. From the upgrade on, its counts stop and nothing fails. Its legal texts, about page
and package file are its own and name the collector until it rewrites them. Every deployed environment owes an apply:
its CSP changes. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Stop here when the app keeps counting page views: it keeps the package, calls `configure` in a fork edit of `root.tsx` and adds `*.onedollarstats.com` back to `connect-src` in a fork edit of `frontend-csp.config.ts`. Its CSP then stays as it was and owes no apply.
2. `frontend/package.json` drops `onedollarstats`; then `pnpm install`. The typecheck then flags any `event()` or `view()` call of it in the app's own code.
3. Not caught by the compiler. `frontend/src/modules/marketing/legal/legal-config.ts` drops the `onedollarstats` subprocessor and the `page_visits` row; `privacy-text.tsx` drops the One Dollar Stats cookie line and "count its use", and renders the cookie list only when one of its items shows, as cella's does.
4. Not caught by the compiler. The about page drops the `onedollarstats` card of `marketing-config.tsx`, its `cards.onedollarstats.*` keys and the sentence on counted page visits in `features.gdpr_legal.text` of `about.json`, and `frontend/public/static/marketing/integrations/onedollarstats.svg`.
5. Not caught by the compiler. Per deployed environment: `pnpm cella infra apply --mode <mode>`, then deploy. The CSP drops `*.onedollarstats.com`.

## Verify

```sh
git grep -n -w -e onedollarstats -e 'One Dollar Stats' -e page_visits
pnpm check
```

The grep prints nothing, unless the app keeps counting. By hand, after the apply: a public page of the deployed
environment sends no request to `onedollarstats.com`, and its `Content-Security-Policy` header no longer names it.
