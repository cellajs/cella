---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: registerOpenApiDocs, writeFile, mkdir, capabilities, chown
---

# Service images are root-owned and run without capabilities

The service images copy their code and dependencies as root, so a process can no longer write inside its image except
in `backend/geoip/`, and every app container drops all Linux capabilities. An app moves a runtime write of its own to a
folder the Dockerfile creates for `app`, declares `capabilities` on a service whose image needs one, and calls
`writeOpenApiCache` beside its own `registerOpenApiDocs` call.

## What & why

`Dockerfile` drops `--chown=app:app` from every production `COPY`, so a compromised process cannot rewrite its code.
`appBlock` and `releaseBlock` in `infra/compose/infrastructure.ts` add `cap_drop: [ALL]` and `no-new-privileges`;
`capabilities` in `services.config.ts` keeps one. `registerOpenApiDocs` no longer writes `openapi.cache.json`: the
local API and `generate:openapi` call `writeOpenApiCache`.

## Blast radius

Apps whose services write under `/app` at runtime, run a service on an image of their own, or call
`registerOpenApiDocs` themselves. Neither the compiler nor a test finds it. No database, lens or `clientCacheVersion`
change. The services config changed, so the next release waits on an infra apply.

## Run

No script: manual.

## Manual steps

1. Regenerate the app-owned `infra/compose.gen.yml` with `pnpm infra:compose`: CI's `compose:check` fails until then.
2. A runtime write under the image's folders (`writeFile`, `mkdir`, a cache or upload folder) moves to a folder the service's production stage creates with `USER root`, `RUN mkdir -p <dir> && chown app:app <dir>`, `USER app`, as the backend's `geoip` step does.
3. A service with an image of its own that fails to start without a capability declares it in `capabilities`, as the SPA proxy does with `NET_BIND_SERVICE`.
4. A call of `registerOpenApiDocs` that relied on its write passes the returned document to `writeOpenApiCache`.

## Verify

Build each target (`docker build --build-arg NODE_VERSION="$(jq -r .engines.node package.json)" --target <svc> .`) and
start it with `--cap-drop ALL --security-opt no-new-privileges:true` against a staging-like env; a refused write shows as
`EACCES` in its log. Then `pnpm check`.
