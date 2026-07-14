# Same-origin migration

Moves every public service onto **one origin**: the API, yjs and mcp become
paths under the app host (`https://www.example.com/api`, `wss://www.example.com/yjs`,
`https://www.example.com/mcp`) instead of per-service subdomains. What this buys:

- **`__Host-` cookies + `SameSite=Strict`**: the session is host-locked, never
  sent to (or spoofable by) other subdomains, and not sent on cross-site
  navigations. Upstream `cookie.ts` applies this automatically.
- **No CORS**: the middleware is gone; no preflight round-trips.
- **CSP `connect-src` collapses to `'self'`**, and dev/tunnel behave like
  production (the Vite dev server proxies `/api`, `/yjs`, `/mcp`).

Upstream code arrives fully migrated. This is a **config migration, not a
codemod** — what a fork must do is flip its own URLs and coordinate the
external pieces:

## 1. Flip your config URLs

In your `shared/config/config.*.ts` overrides (production values come from
`config.default.ts` if you don't override them):

```ts
frontendUrl:    'https://www.example.com',
backendUrl:     'https://www.example.com/api',
backendAuthUrl: 'https://www.example.com/api/auth',
yjsUrl:         'wss://www.example.com/yjs',
mcpUrl:         'https://www.example.com/mcp',
```

Do the same for your staging mode (`https://staging.example.com/api`, …).
Development and tunnel configs are upstream files and arrive already flipped
(`http://localhost:3000/api` through the Vite proxy; the tunnel now fronts
Vite, not the backend, so `SameSite=None` is gone).

## 2. Keep old hosts alive as redirects

For every service host that was **live** before the flip, add a `legacyUrls`
entry — the LB keeps its DNS record + certificate and answers with a 301 into
the path-based URL (`api.example.com/x` → `www.example.com/api/x`), so links in
old emails and cached clients keep working:

```ts
legacyUrls: { backend: 'https://api.example.com' },  // + yjs/mcp if they were live
```

Entries for disabled services are ignored. After a deprecation window, delete
the entries — DNS record, cert and redirect are decommissioned together on the
next `pulumi up`.

## 3. Update OAuth provider consoles (before deploying!)

Redirect URIs are derived from `backendAuthUrl`, so they change to
`https://www.example.com/api/auth/<provider>/callback`. Update the registered
URIs in the Google / GitHub / Microsoft consoles for **both stacks**:

- Google & Microsoft allow multiple URIs — add the new ones ahead of the deploy,
  remove the old ones after.
- GitHub OAuth apps allow **one** callback URL — flip it right after the deploy's
  version gate passes (brief GitHub-sign-in gap is unavoidable with one app).

## 4. Cookie break (forced re-login)

Upstream bumps `cookieVersion` (`v1` → `v2`) as a clean break from the
Domain-scoped cookies: every logged-in user re-authenticates once at cutover.
If your fork already moved past `v2`, bump your own value once more with this
pull. Stale old-version cookies age out unread. If your fork references cookie
names anywhere (tests, API docs), build them with `authCookieName()` from
`backend/src/modules/auth/general/helpers/cookie.ts`.

## 5. Check fork-specific assumptions

- **CORS is gone**: if your fork served extra browser origins (a second SPA,
  a widget), those requests now fail — either move them onto the app origin or
  re-add a scoped `cors()` for the affected routes.
- **Registry**: `lbRoute` values are now `'path'` for backend/yjs/mcp and
  `'default'` for the frontend proxy. A fork-added service keeps working with
  `'host'`, or joins the app origin with `lbRoute: 'path'` + `lbPathBegin`
  (must also serve itself under that prefix — see `backend/src/server.ts`
  self-mounts). Run `pnpm --filter infra compose:generate` after editing.
- **Dev ports are conventions now**: the Vite proxy targets backend `4000`,
  yjs `4002`, mcp `4003`; public URLs no longer carry ports, so anything that
  derived a port from `backendUrl`/`yjsUrl` must use the static port.
- **External clients** (mobile apps, MCP clients, cached SDK configs): they
  keep working through the 301s during the deprecation window; update their
  base URLs before removing `legacyUrls`.

## 6. Gates

```sh
pnpm --filter infra compose:generate
pnpm check
pnpm test:core
pulumi preview   # expect: routes/ACLs change; DNS records and certs UNCHANGED
```

On staging, verify: password + magic-link + OAuth sign-in, **OAuth connect on
the account page** (the Strict-sensitive flow), invite accept, SSE entity
stream, yjs collab, and `curl -I https://api-staging.example.com/auth/x` →
301 preserving path + query.
