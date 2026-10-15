---
syncBreaking: true
clientCacheBump: false
---

# Node runs at the exact version the root engines.node pins

The root `package.json` `engines.node` is now an exact version (`26.12.0`), and CI, the deploy pipeline and both
Dockerfiles read it: `setup-node` through `node-version-file: package.json`, the images through a `NODE_VERSION` build
arg without a default. Make sure your root `engines.node` is that exact version after the sync, pass the build arg in any
image build of your own, and install that Node locally.

## What & why

CI took the newest Node 26 (`node-version: 26`) and the images built from `node:26-alpine`, while machines ran older
patches: twice a Node patch broke something on the runner only (#1343, #1406), and an image could run a Node CI never
tested. One field now sets the version. To bump Node, change the root `engines.node`; CI, images and apps (through the
sync) follow.

## Blast radius

Every app. While the root `engines.node` is a range, every image build fails at `FROM` (`node:26.x-alpine` is no tag),
including the `docker-images` job that now runs on `cella/sync/*` PRs. Workspace packages keep `26.x`. No database or
cache change.

## Run

No script: manual.

## Manual steps

1. Apply `20261015T1546-sync-config-engines-and-about` first: with `engines` in `packageJsonSync`, the sync brings the pin.
2. After the sync, check the root `package.json`: `engines.node` is `26.12.0`. If it still reads `26.x`, set it by hand.
3. Any build of `Dockerfile` or `infra/boot/Dockerfile` that the app runs itself (a script, another workflow) passes `--build-arg NODE_VERSION="$(jq -r .engines.node package.json)"`.
4. Version files of the app's own (`.nvmrc`, a `volta` key, hosting settings): set them to the same version, or delete them.
5. On every machine: `volta install node@26.12.0` (or `nvm install 26.12.0`). pnpm warns `Unsupported engine` until then.

## Verify

```sh
node -v
jq -r .engines.node package.json
docker build --build-arg NODE_VERSION="$(jq -r .engines.node package.json)" --target backend -t backend-check .
pnpm check
```
