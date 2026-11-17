---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: req.url, endStream, BackendRouteApp
---

# The request URL keeps its prefix

App code that takes a pathname from `ctx.req.url` or `ctx.req.raw.url` reads `ctx.req.path`: the URL now keeps the
mounted prefix (`/api`, `/mcp`) and a custom method's `:verb`. `endStream(stream)` becomes `stream.abort()`, and
`BackendRouteApp` is `Hono<Env>`.

## What & why

The backend routes each request once, through the `getPath` option `createBaseApp` passes (`routedPath` in
`backend/src/server.ts`): it strips a mounted prefix once and routes `<resource>:<verb>` at its `/~verb`. No request is
rebuilt or dispatched twice. `ctx.req.path` is the routed path, and `ctx.req.url` keeps what the client sent.
`createBaseApp` also passes `defaultHook`, which every module app routed into it inherits.

## Blast radius

App code that parses `ctx.req.url` for a path, calls `endStream`, or mounts an app `Hono<Env>` does not accept. The
compiler flags the last two; only reading the code finds the first. No cache or schema change; `pnpm sdk` adds a 415
response to operations with a body.

## Run

No script: manual.

## Manual steps

1. A pathname taken from `ctx.req.url` or `ctx.req.raw.url` reads `ctx.req.path`.
2. `endStream(stream)` becomes `stream.abort()`.
3. A module app that `BackendRouteApp` (now `Hono<Env>`) refuses is typed `OpenAPIHono<Env>` or `Hono<Env>`.
4. Optional: a module app can be `new OpenAPIHono<Env>()`; passing `{ defaultHook }` still works.

## Verify

```sh
pnpm check
```
