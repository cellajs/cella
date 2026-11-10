---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: ipCountry, ip_country, countryCodeSchema, commonCountries, countryName
generate: true
---

# A country code is a regionCode everywhere

`sessions.ipCountry` is `ipRegionCode` in the table, the API and the SDK, and `pnpm generate` with this folder's
`hints.json` renames its column. `lookupIp`, `SignInContext` and `RequestDetails` return `regionCode` where they had
`country`. `countryCodeSchema` is `regionCodeSchema`, the backend's `countryName` is `regionName`, and the config key
`commonCountries` is `commonRegionCodes`.

## What & why

AEP-143 names an ISO 3166-1 alpha-2 code `region_code`, and the organization's `regionCode` already followed it. The
same code was also called `ipCountry`, `country`, `countryCode` and `commonCountries`. One name now holds it in the
tables, the API, the config and the backend types. Labels and UI component names (`CountryFormField`, `c:country`) keep
the word "country".

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read. An outside API client that reads
`ipCountry` breaks. `clientCacheVersion` moves to `v41-region-codes`. Session rows keep their values through the rename.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1526-region-code-names/hints.json)"`: it renames `sessions.ip_country` to `ip_region_code` and nothing else.
2. In `shared/config/config.default.ts`, rename `commonCountries` to `commonRegionCodes`, and bump the app's own `clientCacheVersion`.
3. App code that reads `session.ipCountry`, `lookupIp(...).country`, a `SignInContext` or `RequestDetails` `country`, `countryCodeSchema` or `countryName` from `#/lib/geoip` takes the new name.

## Verify

```sh
pnpm migrate
pnpm check
```

Then open the sessions list on the account page: each session still shows its country flag and name.
