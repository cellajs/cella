---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# Company config: optional fields and an address group

In `shared/config/config.default.ts`, `company.githubUrl` moves to a top-level `repositoryUrl` and `company.mapZoom`
to a top-level `mapZoom` beside `mapStyleUrls`. `tel` becomes `phone`, `element` becomes `chatUrl`, and `shortName` and
`blueskyHandle` are removed. The address fields go into an optional `company.address` with `postcode` renamed
`postalCode` and `country` replaced by `regionCode`.

## What & why

`CompanyConfig` held every field as a required string, and an empty one printed as a blank: a fresh app's emails ended
in `・・, `, and its legal pages and contact page showed empty lines and links. A field an app lacks is now left out.
`regionCode` is an ISO 3166-1 alpha-2 code, so the country reads in the visitor's language. The other renames follow
common names.

## Blast radius

Every app: its config fails typecheck until converted. No wire, cache or schema change. Apps that read the company
fields in their own code get type errors at each read.

## Run

No script: manual.

## Manual steps

1. Move `company.githubUrl` to a top-level `repositoryUrl` after `productionUrl`, or drop it when the app has no public repository.
2. Move `company.mapZoom` to a top-level `mapZoom` after `mapStyleUrls`.
3. Rename `tel` to `phone` and `element` to `chatUrl`; delete `shortName` and `blueskyHandle`.
4. Wrap `streetAddress`, `postcode` (now `postalCode`), `city`, `country`, `directionsUrl` and `coordinates` in `company.address`.
5. Replace `country: 'The Netherlands'` with its ISO code, as in `regionCode: 'NL'`; the compiler accepts any string here.
6. Delete every company field whose value is `''`, and `coordinates: { lat: 0, lng: 0 }`: an absent field hides its line, link or map.
7. In app code, read `appConfig.repositoryUrl`, `appConfig.mapZoom` and `appConfig.company.address?.…`, and show a country with `regionName(regionCode, language)`.

## Verify

```sh
pnpm check
```

Then open `/contact`, `/legal` and an email preview: the address, phone and links show as configured, and none is blank.
