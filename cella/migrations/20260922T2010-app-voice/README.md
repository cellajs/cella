---
syncBreaking: false
clientCacheBump: false
---

# app voice: no product name in identifiers and wire strings

The domain verification TXT record is _<appConfig.slug>-verification.<domain> (was
_cella-verification) and the HKDF salt behind encryptData is the neutral constant data-encryption
(was cella:data-encryption), which re-keys every stored ciphertext: TOTP secrets encrypted before
the change no longer decrypt, so delete them (no users) or keep the old salt with a marker. pnpm
vocabulary:check gains a product-name rule rejecting cella_*, Cella*, _cella-* identifiers and
cellajs.com literals in backend/src, shared/src and frontend/src; cella/AGENTS.md records that cella
in code names the template only where it contrasts with the app.

## What & why

Two template leaks shipped the template's name to an app's own users: the domain verification TXT record
`_cella-verification.<domain>` and the HKDF salt `cella:data-encryption` behind `encryptData`. The record is now
`_<appConfig.slug>-verification.<domain>` (backend lookup, route description, and the value the domain tile shows),
the salt is the neutral constant `data-encryption`. `pnpm vocabulary:check` gains a second rule that rejects
`cella_*`, `Cella*`, `_cella-*` identifiers and `cellajs.com` literals in `backend/src`, `shared/src` and
`frontend/src` (tests, config, docs and marketing excluded); `cella/AGENTS.md` records when `cella` may appear in
code (template-vs-app contrast only).

## Blast radius

**Re-keys every stored ciphertext.** Values encrypted before this change (TOTP secrets in `totps`, and any column
an app encrypts with `encryptData`) no longer decrypt: `decryptData` throws on the auth tag. Not sync-breaking, no
cache bump. Domains already marked verified stay verified; a domain verified after the sync needs the new record
name, which the domain tile shows.

## Run

No script: manual.

```sh
pnpm sdk
pnpm vocabulary:check
```

## Manual steps

1. Before deploying: decide what to do with existing encrypted rows. With no real users (the template's state),
   `DELETE FROM totps;` and let people enrol again. With users, keep the old salt in the app (`// fork:` marker on
   `HKDF_SALT`) or run a re-encryption pass before switching.
2. Tell tenants with a pending domain verification to add the `_<slug>-verification` record instead.
3. Run `pnpm vocabulary:check`; the new rule may flag app identifiers that carry the template name (rename or
   allowlist them in `shared/config/vocabulary-allowlist.ts`).

## Verify

```sh
pnpm vocabulary:check
pnpm --filter backend exec vitest run src/utils/data-encryption.test.ts
```
