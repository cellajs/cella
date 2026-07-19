# Same-origin migration

Moves every public service onto **one origin**: the API, yjs and mcp become paths under the app host (`https://www.example.com/api`, `wss://www.example.com/yjs`, `https://www.example.com/mcp`) instead of per-service subdomains. What this buys:

- **`__Host-` cookies + `SameSite=Strict`**: the session is host-locked, never sent to (or spoofable by) other subdomains, and not sent on cross-site navigations. Upstream `cookie.ts` applies this automatically.
- **No CORS**: the middleware is gone; no preflight round-trips.
- **CSP `connect-src` collapses to `'self'`**, and dev/tunnel behave like production (the Vite dev server proxies `/api`, `/yjs`, `/mcp`).

Upstream code arrives fully migrated. This is a **config migration, not a codemod** — what a fork must do is flip its own URLs and coordinate the external pieces:

## 1. Flip your config URLs

In your `shared/config/config.*.ts` overrides (production values come from `config.default.ts` if you don't override them):

```ts
frontendUrl:    'https://www.example.com',
backendUrl:     'https://www.example.com/api',
backendAuthUrl: 'https://www.example.com/api/auth',
yjsUrl:         'wss://www.example.com/yjs',
mcpUrl:         'https://www.example.com/mcp',
```

Do the same for your staging mode (`https://staging.example.com/api`, …). Development and tunnel configs are upstream files and arrive already flipped (`http://localhost:3000/api` through the Vite proxy; the tunnel now fronts Vite, not the backend, so `SameSite=None` is gone).

## 2. Your old service hosts go dark — check what still points at them

A host that no longer backs a service loses its DNS record and certificate on the next `pulumi up`. `api.example.com` stops resolving at cutover; anything still aimed at it fails. Upstream ships **no redirect mechanism** — cella had one (`legacyUrls`) for exactly one day and dropped it before any fork depended on it, since cella itself had no production traffic to protect. Work out what your fork has in flight before you flip:

- **Links in already-sent emails** are the main exposure, and they self-heal: invites live 7 days, verification tokens 2 hours, magic links 15 minutes. One week after the flip, every pre-flip auth link would have expired anyway.
- **Unsubscribe links never expire.** They are built from `backendUrl` (`send-newsletter.ts`) against tokens that stay valid forever (`unsubscribe-tokens-db.ts`). Every newsletter you sent before the flip carries `api.example.com/unsubscribe?token=…` in an inbox somewhere, and keeping unsubscribe working is a legal obligation, not a nicety. **If you have ever sent a newsletter, resolve this before flipping.**
- **Non-browser API clients were never rescuable anyway.** A 301 doesn't reliably carry a POST, and a browser client following the cross-origin redirect needs CORS, which this migration removes. Ship their new base URL ahead of the flip regardless.

If that exposure is real for you, keep the old host alive yourself: a DNS record, a Let's Encrypt cert and a redirect ACL on the HTTPS frontend, ahead of the routes. The deleted upstream implementation is a working reference — see `infra/resources/loadbalancer.ts` in commit `5af3e5606`, which reads the hosts from config and 301s each into the app origin under the service's `lbPathBegin`, preserving path and query.

## 3. Update OAuth provider consoles (before deploying!)

Redirect URIs are derived from `backendAuthUrl`, so they change to `https://www.example.com/api/auth/<provider>/callback`. Update the registered URIs in the Google / GitHub / Microsoft consoles for **both stacks**:

- Google & Microsoft allow multiple URIs — add the new ones ahead of the deploy, remove the old ones after.
- GitHub OAuth apps allow **one** callback URL — flip it right after the deploy's version gate passes (brief GitHub-sign-in gap is unavoidable with one app).

## 4. Cookie break (forced re-login)

Upstream bumps `cookieVersion` (`v1` → `v2`) as a clean break from the Domain-scoped cookies: every logged-in user re-authenticates once at cutover. If your fork already moved past `v2`, bump your own value once more with this pull. Stale old-version cookies age out unread. If your fork references cookie names anywhere (tests, API docs), build them with `authCookieName()` from `backend/src/modules/auth/general/helpers/cookie.ts`.

## 5. Check fork-specific assumptions

- **CORS is gone**: if your fork served extra browser origins (a second SPA, a widget), those requests now fail — either move them onto the app origin or re-add a scoped `cors()` for the affected routes.
- **Registry**: `lbRoute` values are now `'path'` for backend/yjs/mcp and `'default'` for the frontend proxy. A fork-added service keeps working with `'host'`, or joins the app origin with `lbRoute: 'path'` + `lbPathBegin` (must also serve itself under that prefix — see `backend/src/server.ts` self-mounts). Run `pnpm --filter infra compose:generate` after editing.
- **Dev ports are conventions now**: the Vite proxy targets backend `4000`, yjs `4002`, mcp `4003`; public URLs no longer carry ports, so anything that derived a port from `backendUrl`/`yjsUrl` must use the static port.
- **External clients** (mobile apps, MCP clients, cached SDK configs): the OpenAPI `servers` entry is derived from `backendUrl`, so anything built off the old spec targets the old host and breaks at cutover (see step 2). Ship their new base URL first.

## 6. Gates

```sh
pnpm --filter infra compose:generate
pnpm check
pnpm test:core
pulumi preview   # expect: routes/ACLs change; the app host's DNS record and
                 # cert UNCHANGED; each old service host's DNS record and cert
                 # DESTROYED (that is the decommission — see step 2)
```

On staging, verify: password + magic-link + OAuth sign-in, **OAuth connect on the account page** (the Strict-sensitive flow), invite accept, SSE entity stream, and yjs collab.
