# Frontend serving options (Caddy vs Nitro vs Hono, and TanStack Start / SSG)

Status: concept

This note captures the architecture options for what currently serves the Cella frontend,
why the question came up, and the trade-offs of each path. It is a decision aid, not a
committed plan. The same serving layer could also help us create and maintain dedicated
error, status, and maintenance pages.
committed plan.

## Why this came up

We run a small Caddy instance (`infra/caddy/Caddyfile`) as the public origin for the SPA.
The actual static bundle lives in the frontend S3 bucket; Caddy reverse-proxies to it and
adds the things S3 + the load balancer cannot. The open question: if we eventually want
**SSG content via TanStack Start** (which runs on a server "negotiator" — Nitro), can we
**merge** that server with the job Caddy does today, so a single server (Nitro *or* a Hono
server) handles security headers, redirects, and SPA fallback alongside rendering?

## What Caddy does for us today

The Caddyfile does four distinct jobs — none of which require Caddy specifically:

1. **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
   Referrer-Policy, Permissions-Policy, COOP. (S3 + the LB can't add these.)
2. **SPA deep-link fallback** — rewrite origin `404` responses to `/index.html` so
   client-side routes resolve on hard navigation.
3. **Cache policy** — `public, max-age=31536000, immutable` for hashed `/assets/*` and
   `/static/*`; `no-cache` for HTML.
4. **Version stamping** — emits `X-App-Version: $RELEASE_SHA`, which the on-VM
   cutover / health gate asserts after each release.

It is effectively a self-hosted equivalent of "CloudFront response-headers-policy +
SPA viewer function", on its own VM, reverse-proxying the real bundle from S3.

## The real decision axis

The decision is **not** "Caddy vs Nitro vs Hono". It is: **do we stay a pure SPA, or move
to a server that renders / prerenders?** TanStack Start changes the answer because Start
ships a server, and that server can absorb all four jobs above.

Facts that matter here:

- **TanStack Start runs on Nitro** (Vite + Nitro v2 under the hood). Nitro's `routeRules`
  can express *every* line of the Caddyfile: `headers`, `redirect`, `prerender` (= our SSG),
  `cache` / `swr`, and a catch-all SPA fallback. Nitro genuinely subsumes Caddy here.
- Start's server entry is just a **web-`fetch` handler**. Nitro is the default deploy
  target, but the handler can also be mounted inside another fetch runtime — including
  **Hono**. That is the door to the "merge".
- Cella is offline-first with auth-gated, sync-engine-fed data. Full SSR fights that model.
  The realistic win from Start is **SSG / prerender for public pages** (landing, docs, blog,
  legal, plus dedicated error, status, and maintenance pages) while the app itself stays SPA
  — the classic hybrid.

## Options

### Option 1 — Status quo (Caddy + S3 SPA)
Keep if we stay a pure SPA. Fewest moving parts; Caddy is a single static binary and is
rock-solid at headers / cache / fallback.
- **Downside:** the CSP must be injected via the `FRONTEND_CSP` env var (built in
  `infra/lib/frontend-csp.ts`) rather than living directly in TS.

### Option 2 — Swap Caddy for a tiny Hono "frontend edge" server
Reimplement the same four jobs in Hono (`serveStatic` + `secureHeaders` + a SPA-fallback
handler + a version-header middleware).
- **Wins:** one language; import `lib/frontend-csp.ts` directly instead of env-injecting it;
  unit-test the header / fallback logic in vitest.
- **Costs:** we babysit a Node process instead of a Caddy binary, and reimplement gzip/br +
  range/etag handling that Caddy provides for free.

### Option 3 — TanStack Start, let Nitro be the negotiator
The merge the question intuited. Nitro `routeRules` owns headers + redirects + immutable
caching + SPA fallback, and `prerender` gives us SSG. Caddy becomes redundant and can be
retired (or kept as a thin LB-edge shim).
- **Best choice if SSG is actually on the roadmap.** Otherwise we adopt a framework to
  replace ~90 lines of Caddy config.

### Option 4 — Layered: thin Caddy at the edge, Nitro/Hono behind it
Edge owns security headers + immutable asset cache + `X-App-Version`; app owns rendering.
- This is the proven separation-of-concerns pattern (edge = headers/cache, app = render)
  used by most CDN-fronted setups. More parts, but each part is simple and the security
  headers stay in one battle-tested place.

### Option 5 (deepest merge) — one Hono process serving both Start and the API
Since Start is a fetch handler, it *can* be mounted inside the same Hono app that runs the
backend, making frontend + API same-origin (kills CORS / cross-site-cookie friction).
- **But** it couples frontend and backend deploy/scaling, which conflicts directly with our
  current per-service-VM + host-routed-LB topology. Interesting, not aligned with the infra.

## Proven patterns to anchor on

- **SPA-on-object-storage**: the canonical form is CloudFront + S3 + a viewer function for
  SPA rewrite + a response-headers-policy. Our Caddy is a faithful self-hosted version of
  exactly that — it is the standard pattern, not a hack.
- **Start + Nitro `routeRules` for headers/prerender** is the documented, idiomatic way to
  do SSG + security headers in one place; this is what most TanStack Start adopters use
  rather than rolling their own.
- **Edge-owns-headers / app-owns-render** (Option 4) is what teams converge on once they
  have both a CDN/edge and an app server, to avoid duplicating CSP logic across two runtimes.

## Recommendation

- If SSG is **speculative**: stay on Option 1. If the env-injected CSP is the main irritant,
  do Option 2 (small Hono edge server) as a low-risk, testable upgrade that keeps the
  topology identical.
- If SSG is **real and near-term** (marketing / docs / public pages): go Option 3 — adopt
  Start in SPA + selective-`prerender` mode and let Nitro's `routeRules` replace the
  Caddyfile. Keep the app itself SPA so we don't fight the sync engine.

## Hard constraint for every path

Whatever serves the frontend **must keep emitting `X-App-Version: <SHA>`**, because the
cutover / health gate asserts it. In Nitro that is a `routeRules` header; in Hono it is one
middleware line; in Caddy it is the existing outer header block.

## Possible next step

Prototype one of:
- (a) the minimal Hono frontend-edge server replicating the Caddyfile (Option 2), or
- (b) a TanStack Start spike with Nitro `routeRules` reproducing the headers + SPA fallback
  + one prerendered public page (Option 3),

so the two can be compared concretely.
