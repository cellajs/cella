---
name: offline-check
description: Check that the built app keeps working without a connection - reloads of pages opened before, a boot with nothing cached or no stored user, an API that never answers, the sign-in page with a session, and a description edited offline - on a testbed with its service worker. Run it after a change to the boot path, connectivity, the API client, the service worker or release takeover, the query persister, the Yjs connection layer or the auth pages, and before a release.
---

# Offline check

Offline regressions hide in the dev server: it serves no service worker, and a reload without a connection never reaches the app there. This skill drives a built app with its worker on `pnpm testbed`, as a returning user's device holds it: signed in, the cache stored, the worker in control.

Each check runs in two conditions where it matters:

- **offline**: no connection at all, as in flight mode. The browser knows and fetches fail at once.
- **unreachable**: the network is up but the API and the relay never answer, as on a captive portal, a lossy link or during an outage. Requests hang, and the app only learns it is offline from its probe.

## Run

Start a testbed (its frontend is built from the working tree), then from the repo root:

```
pnpm testbed -- env ORG_PATH=<tenantId>/<orgSlug> [PAGES=<path>,...] [ONLY=reload,detect,cold,nouser,auth,description] \
  [ROW=<attachment name>] [EMAIL=<email>] OUT_DIR=<scratch> node cella/skills/offline-check/offline-driver.mjs
```

- `ORG_PATH`: an organization the user administers that holds attachments. On the seeded testbed:
  `SELECT o.tenant_id, o.slug FROM organizations o JOIN memberships m ON m.organization_id = o.id AND m.role = 'admin' JOIN users u ON u.id = m.user_id AND u.email = 'agent-test@cellajs.com' JOIN attachments a ON a.organization_id = o.id GROUP BY 1, 2 LIMIT 3;`
- `PAGES`: the pages a reload checks, `/home`, the organization's attachments and `/account` by default. An app appends its own main pages (a board, a list): the reload and cold checks then cover them.
- The run takes about three minutes, prints PASS or FAIL per assert, writes `offline-evidence.json` and `shots/`, and exits 1 when an assert failed. A frontend change needs the testbed restarted (`pnpm testbed stop`, then `pnpm testbed`), which rebuilds it.

## The matrix

| Check | Setup | Expected | Guards |
|---|---|---|---|
| `reload` | each page opened online, then reloaded offline and unreachable | the page renders from the device within 5 s offline, 15 s unreachable, never the no-connection notice | route `beforeLoad`s and loaders read the cache first; `getMenuData` |
| `detect` | the API stops answering | the app counts as offline within 10 s | `connectivity.ts` probe, `responseWaitMs` in `api-client.ts` |
| `cold` | the stored queries emptied, as the first boot of a release with another `clientCacheVersion` does | the app layout renders with what the device holds, no notice | `getMenuData` cold reads, `resolveChannelBySlug` |
| `nouser` | the stored user dropped, as a lost session leaves it, offline | the no-connection notice, and the page loads by itself once back online | `requireSession`, `ErrorNotice` retry on reconnect |
| `auth` | the sign-in page with a valid session: stored user online and offline, a `redirect`, no stored user offline | leaves for home or the redirect; with no stored user it stays offline and leaves once back online | `authenticateBeforeLoad`, the reconnect check in `AuthenticatePage` |
| `description` | another device edits a row online; this one never opened it, reloads offline, edits it, reconnects | the edit reaches the server row, with no parked-edits notice | offline seed and `rebaseSeedEdits` in the Yjs connection layer |

## By hand

What a headless browser cannot reach. Check these before a release that touches the areas named:

- **A phone**: install the PWA, use it, close it, turn on flight mode, open it. The last pages render, a description takes edits, and they save once the network is back ([android-emulator](../android-emulator/SKILL.md), or a real device over USB).
- **Release takeover**: with a new release waiting (the reload prompt shows), go offline and reload. The page stays on the current release; online, the reload moves to the new one (`mayTakeOver` in `app-update.ts`). A closed PWA reopened offline is taken over by the browser itself: the `cold` check is what that boot looks like.
- **A lossy network**: Chrome DevTools, a custom throttling profile with high latency and packet loss. The app goes offline within seconds, and every edit made meanwhile is saved once it is back.
- **Two tabs**: one offline edit per tab on one description; both reach the server ([two-tab-sync-test](../two-tab-sync-test/SKILL.md), its `tabs` experiment).

## Reading a failure

- A `reload` or `cold` failure with `spinnerOnly` names a route whose `beforeLoad` or loader awaits a read that was never cached. Find the await in the route logic: a read the page can go without fails over to the cache or to nothing offline.
- An `error: true` names a network error that reached the router: a guard rethrew it. Only a missing user may show the notice.
- `detect` above 10 s: the probe repeats attempts that timed out, or `responseWaitMs` grew.
- `description` with the parked-edits notice: the rebase found a conflict or did not run. Its console lines start with `[yjs]`.
