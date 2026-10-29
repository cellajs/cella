---
breaking: false
clientCacheBump: false
grep: logo-email.png
---

# Email logo on the page grey, footer on one line

The email logo's tile takes the page's grey, `#f5f5f5`, so it blends into the page, and the footer's first two lines
become one: "Sent to emily@example.com by Cella・Email us". An app re-exports its own `logo-email.png` on that grey.

## What & why

The white tile behind the logo stood out as a white card on the grey page under the body panel. The tile stays baked
into the image, so a client that darkens the page without the mail's dark styles still shows a legible logo; it now
matches the page in light mode. The address, the app's name and the support link read as one sentence, with the support
link as "Email us".

## Blast radius

Visual only. The footer and its `backend:email.sent_to` and `backend:email.support_email` texts change with the upgrade;
an app that overrides either text keeps its own wording. `frontend/public/static/common/logo/logo-email.png` is the
app's own, so its tile stays white until the app replaces it. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Replace the white tile of the app's `frontend/public/static/common/logo/logo-email.png` with `#f5f5f5`, keeping its
   size (408 by 156 pixels), its rounded transparent corners and the logo's own colors. `logo-email-dark.png` has no tile
   and stays.

## Verify

```sh
pnpm check
```

Then open an email preview (`/dev/emails/magic-link` on the backend) and check that the logo shows no lighter tile.
