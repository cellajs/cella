# GeoIP databases come from the public bucket, not the image

## What & why

The Docker `geoip` stage and `backend/scripts/download-geoip.ts` are gone. `backend/src/lib/geoip.ts` now downloads
`dbip-country-lite.mmdb.gz` and `dbip-asn-lite.mmdb.gz` from `GEOIP_SOURCE_URL` (default: the `geoip/` prefix of
`appConfig.s3.publicCDNUrl`) at boot and daily, and substitutes `GEOIP_DEV_SAMPLE_IP` for loopback in development.
The new sign-in notice omits its location line when no country is known (`{{- location}}` in the locale text).
Data refreshes with `pnpm infra` → Refresh GeoIP data, the deploy pipeline (35-day gate) and a monthly workflow.

## Blast radius

Not sync-breaking, no cache bump, no database change. Production shows no country until the first deploy after the
sync (the pipeline fills the prefix) or a manual refresh. Apps that never touched GeoIP, the Dockerfile, the
account-security email or `print-deploy-env` are otherwise unaffected.

## Run

No script: manual.

## Manual steps

1. Once after the sync, publish the data for production: `pnpm infra` → Stack setup → Refresh GeoIP data (or wait for
   the next deploy).
2. An app with its own `new-sign-in.text` translation replaces `<strong>Location:</strong> {{country}} (approximate)<br>`
   with `{{- location}}` and adds the `email.account_security.location` key.
3. An app that customized the Dockerfile drops its `geoip` stage and the `COPY --from=geoip` line, and keeps
   `backend/geoip` writable by the `app` user.
4. An app with a custom deploy env consumer adds `public_bucket` to what it expects from `print-deploy-env`.

## Verify

```sh
grep -rn "download-geoip\|--from=geoip\|geoip:download" backend Dockerfile .github
pnpm --filter infra test -- tasks/geoip-refresh tasks/print-deploy-env
pnpm --filter backend test -- src/lib/geoip tests/emails tests/sign-in
pnpm check
```
