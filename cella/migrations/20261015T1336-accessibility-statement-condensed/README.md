---
syncBreaking: false
clientCacheBump: false
---

# The accessibility statement has four sections

`accessibility-text.tsx` renders four sections: `overview`, `what-you-can-do`, `known-limitations` and `how-we-test`.
Remove `commitment`, `third-party-content`, `conformance-report` and `feedback` from
`legalConfig.accessibility.sections` in your `frontend/src/modules/auth/legal/legal-config.ts`.

## What & why

The statement had grown to eight sections that few readers got through. The commitment and feedback text moved into
the overview, third-party content into known limitations, and the conformance report into how we test, each cut to a
sentence or two. The text reads `accessibilityReview` as before.

## Blast radius

Apps with their own `legal-config.ts`, which is every app. Left as is, the legal page's table of contents lists the
four removed sections and their links lead nowhere. Nothing breaks. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. In `legalConfig.accessibility.sections`, keep `overview`, `what-you-can-do`, `known-limitations` and `how-we-test`.

## Verify

```sh
pnpm --filter frontend ts
pnpm check
```
