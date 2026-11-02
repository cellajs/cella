---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: iconOnly, logo.tsx
---

# The logo splits into app-owned art and a template-owned Logo

Move an app's logo artwork from `common/logo.tsx` into `LogoMark` and `LogoText` in `common/logo-art.tsx`, swap the `ignored` entry in `cella/cella.config.ts` to `logo-art.tsx`, and take the template's `logo.tsx`. Replace `height`, `iconOnly` and any app-only size prop at the app's own `Logo` call sites with `size`, or with `LogoMark`.

## What & why

The same `Logo` call drew a different size in every app, because each `viewBox` hid different padding. `logo-art.tsx` now holds only art under strict `viewBox` rules, written at the top of cella's copy. `logo.tsx` is template code with typed sizes, so call sites never compensate for a brand.

## Blast radius

Every app. Breaking, no database or cache change. Until the steps are done an app's rail and menu show cella's mark from the `logo-art.tsx` that arrives, without a type error there, so read the screen as well as the typecheck.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, replace `frontend/src/modules/common/logo.tsx` with `frontend/src/modules/common/logo-art.tsx` under `ignored`.
2. Write your mark into `logo-art.tsx` as `LogoMark`: a square `viewBox` centred on the artwork, touching the box on its long side. Add padding only to make the mark look smaller.
3. Write your text as `LogoText`: the mark's `viewBox` y and height unchanged, edges on the artwork left and right. A wordmark file that includes the mark needs a text-only version.
4. Run `git checkout cella-upstream/main -- frontend/src/modules/common/logo.tsx`, then fix what the typecheck reports at app-owned `Logo` call sites, such as the marketing module: `sm` is a 20px mark, `md` 28, `lg` 32, `xl` 36.
5. Remove the `logo.tsx:Logo` entry from `frontend/vite/react-compiler-allowlist.app.json` if the build reports it as stale.

## Verify

Open the `common/Logo` story `ArtBoxes` and check the boxes, then open the menu on a phone width: the mark centres over the avatars and the text starts where the names start.

```sh
pnpm check
```
