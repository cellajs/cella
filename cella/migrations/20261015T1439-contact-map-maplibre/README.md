---
syncBreaking: true
clientCacheBump: false
---

# Contact map moves from Google Maps to MapLibre

The contact map renders with MapLibre GL and a style URL per color mode, so it needs no API key. In
`shared/config/config.default.ts` an app replaces `googleMapsKey` with `mapStyleUrls: { light, dark }`, renames
`company.googleMapsUrl` to `company.directionsUrl`, and lowers `company.mapZoom` by one to keep the same view.

## What & why

`@vis.gl/react-google-maps` is replaced by `maplibre-gl`, and the CSP allows each style URL's origin in place of
`maps.googleapis.com`. The template default is OpenFreeMap (no key, no cookies, EU operator), which removes a Google
request with a visitor's IP from the public contact page. MapLibre zoom is one lower than Google's for the same
view (512px tiles).

## Blast radius

Sync-breaking for every app: `config.default.ts` and the env configs are app-owned, so `googleMapsKey` and
`googleMapsUrl` fail the type check until renamed. No schema change, no cache bump. Empty style URLs hide the map.

## Run

No script: manual.

## Manual steps

1. In `shared/config/config.default.ts`, replace `googleMapsKey` with `mapStyleUrls: { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' }`, or another MapLibre style URL per mode, or `''` to hide the map.
2. Delete `googleMapsKey` from `config.development.ts`, `config.production.ts` and any other env config.
3. Rename `company.googleMapsUrl` to `company.directionsUrl`.
4. Lower `company.mapZoom` by one (Google 4 is MapLibre 3, Google 15 is MapLibre 14).
5. Grep `googleMaps` in app-owned code for other readers.
6. Delete or restrict the old Google Maps API key in Google Cloud.

## Verify

```sh
pnpm check
```
