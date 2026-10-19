---
syncBreaking: true
clientCacheBump: false
---

# The privacy policy and terms name the GDPR, and the company has a VAT number

Rename `company.bankAccount` to `company.vatNumber` in `shared/config/config.default.ts` and `config.template.ts`. In your
`frontend/src/modules/auth/legal/legal-config.ts`, delete `collectedData`, drop the sections the texts no longer render,
and check that `sharedDataTypes` and `subprocessors` describe what your app does: the privacy text now shows `legalBasis`.

## What & why

`privacy-text.tsx` and `terms-text.tsx` were rewritten for organizations as customers, the GDPR and EU consumer law.
The privacy text is one table of data, purpose, legal basis and retention: `collectedData`, its `CollectedDataCategory`
type and the `introduction`, `data-we-collect`, `data-retention` and `processed-data-types` sections are gone. The terms
drop `introduction` and `privacy`. The contact block shows the VAT number in place of the bank account.

## Blast radius

Every app: `legal-config.ts` and the app config fail to typecheck until both are updated. Sections left in
`legal-config.ts` stay in the table of contents as dead links. No database change, no cache bump.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts` and `config.template.ts`, rename `company.bankAccount` to `company.vatNumber` and fill it in.
2. In `legal-config.ts`, delete `collectedData` and its `CollectedDataCategory` import; move anything it said that `sharedDataTypes` lacks into `dataCategories`.
3. In `legalConfig.privacy.sections`, keep `overview`, `how-we-use-data`, `data-processing`, `subprocessors`, `cookies`, `security`, `your-rights`, `changes`, in that order.
4. In `legalConfig.terms.sections`, remove `introduction` and `privacy`.
5. Write each `sharedDataTypes` entry's `legalBasis` as the table shows it (`Contract`, `Legitimate interest`).
6. Add every third party your app sends personal data to (error monitoring, analytics) to `subprocessors`.
7. Describe Maple as error monitoring without session recordings or cookies: `frontend/src/lib/maple.ts` turns them off.

## Verify

```sh
pnpm --filter frontend ts
pnpm check
```
