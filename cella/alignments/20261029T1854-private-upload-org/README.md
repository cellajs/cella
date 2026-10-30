---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: getSignedUrlFromKey, AvatarFormField, getUploadToken, publicBucket
---

# Private uploads need an organization, presigned links pin their type

An app-owned call of `getSignedUrlFromKey` passes the file's declared `contentType`, an app-owned request for an upload
token with a private template names an `organizationId` the user may create attachments in, and an `AvatarFormField`
for a channel's logo passes that channel's `organizationId`.

## What & why

A presigned link served a stored file with the type it was uploaded with, so an uploaded HTML page opened as a page on
the private bucket's host. `getSignedUrlFromKey` now pins the served type and serves anything but a raster image, audio,
video or PDF as a download; its links last two hours. A private upload token without an organization stored files that
no row could name and no sweep removed.

## Blast radius

Apps that sign private keys in their own code (typecheck names each call), request private upload tokens of their own,
or show a channel logo field. No database, lens or cache change. An app that only uses the template's uploaders is
unaffected.

## Run

No script: manual.

## Manual steps

1. Pass `contentType` to each app-owned `getSignedUrlFromKey` call: the declared type of the object the key names, `null` to always serve a download.
2. Give each app-owned `getUploadToken` request for a private template an `organizationId`; the token answers 400 without one and 403 when the user may create no attachment there.
3. Pass `organizationId` to each `AvatarFormField` that sets a channel's logo, so the logo lies under the organization's prefix and goes with it.

## Verify

```sh
pnpm check
```
