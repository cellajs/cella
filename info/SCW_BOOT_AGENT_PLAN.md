# Scaleway boot agent plan

Status: proposal. Scope: replace the brittle parts of VM first boot with a small, testable TypeScript agent that is installed in the baked Scaleway compute image. This is deliberately narrower than a hosted PaaS agent or a long-lived remote-control daemon.

## 1. Thesis

The new Packer image work in `infra/` creates the right place to put a tiny host runtime. The current image bake only installs Docker Engine and the Docker Compose plugin, then `cloud-init` still owns release-specific orchestration: write `/opt/app/compose.yml`, write env files, hydrate Secret Manager values, pull the pinned image, optionally run the migrate companion, and start the app.

The next step should be a **required baked compute image** containing Docker, Node.js, and a `cella-boot-agent` binary/script. Cloud-init should shrink to a launcher that writes a boot plan JSON file and starts a systemd unit. The agent owns the boot state machine.

This gives us readable TypeScript, narrow testable behavior, and a future path toward a Scaleway PaaS without immediately rebuilding the deployment model around a long-lived control-plane daemon.

Non-goal for this phase: a network-accessible agent API. No inbound SSH exists today; we should not replace that with a new privileged HTTP surface.

## 2. Current implementation facts

### 2.1 Image bake surface

The current Packer template is `infra/image/compute-docker.pkr.hcl`. It builds from `ubuntu_noble`, installs Docker packages from Docker's Ubuntu apt repo, enables Docker, validates `docker --version` and `docker compose version`, then cleans apt state.

The user-facing docs are in `infra/README.md` under **Compute image baking**. The package scripts are:

- `pnpm --filter infra image:init`
- `pnpm --filter infra image:validate`
- `pnpm --filter infra image:build`

`infra/config/general.config.ts` exposes:

```ts
compute: {
  image: 'ubuntu_noble',
  dockerPreinstalled: false,
}
```

`infra/resources/compute.ts` passes `infra.computeImage` into the Scaleway server image and `infra.dockerPreinstalled` into `renderCloudInit`. `infra/resources/cloud-init.ts` skips the Docker installation block only when `dockerPreinstalled` is true.

### 2.2 Boot work still done in cloud-init

`infra/resources/cloud-init.ts` currently performs these steps in generated bash:

1. Mirror output to `/var/log/cella-boot.log` and the serial console.
2. Install a boot-log replay systemd unit.
3. Wait for the private-network NIC.
4. Optionally install Docker.
5. Write `/opt/app/compose.yml`, `/opt/app/.env`, and `/etc/runtime-secrets/manifest.json`.
6. Log into the registry with the baked VM reader key.
7. Install a Python `runtime-secret-sync` script.
8. Hydrate `/opt/app/.env.runtime` from Secret Manager.
9. Pull the pinned compose profile image.
10. Run the one-shot `migrate` companion for `runMigrate` services.
11. Start the app container.
12. Scrub cloud-init logs.

The highest-risk parts are already platform logic, not VM initialization. They should be first-class TypeScript code.

### 2.3 Current deployment sequencing has an explicit cutover driver

`infra/tasks/cutover.ts` contains the pure expand/contract controller for pending VM generations, and `infra/tasks/deploy-service.ts` wraps it with Pulumi create/destroy bookends. CI now deploys the backend first, then the remaining VM services, using live `SetBackendServers` for LB-backed services.

`infra/resources/loadbalancer.ts` sets initial `serverIps` but ignores live changes, so Pulumi creates and destroys generations while the deploy task owns the LB server list during cutover. A service with `stablePrivateIp: true` also advances `infra:stableInternalGen_<svc>`, moving its stable internal IP before the LB contracts.

This matters for the agent plan: a boot agent improves first-boot reliability and testability, but the deploy-controller remains the owner of traffic handoff.

## 3. Proposed narrow architecture

### 3.1 Required baked image contract

Make the baked image required for production and, eventually, for all managed deployments. The image should contain:

- Ubuntu Noble base.
- Docker Engine.
- Docker Compose plugin.
- Node.js 24.x, matching the root `package.json` engine.
- A preinstalled `cella-boot-agent` executable.
- A systemd unit template for the boot agent.

The cloud-init fallback path that installs Docker from apt should be kept only during a migration window. Once the image contract is proven, remove the fallback. A required image is simpler than a matrix of image capabilities.

The contract should be named and versioned in config, not inferred from booleans. A VM image that supports this plan must satisfy at least:

- `docker --version` and `docker compose version` pass.
- `node --version` reports Node 24.x.
- `cella-boot-agent --version` reports an agent build identifier.
- `cella-boot-agent supports --schema-version 1` or equivalent exits 0.

If cloud-init renders a schema the baked agent does not support, the boot must fail before writing app files. That is better than partially booting with a mismatched agent/image pair.

### 3.2 Boot plan file

Pulumi should render a single boot plan JSON document and write it through cloud-init, for example `/etc/cella/boot-plan.json`:

```json
{
  "schemaVersion": 1,
  "service": "backend",
  "profile": "backend",
  "releaseSha": "abc123",
  "imageContract": "docker-node-agent-v1",
  "registry": "rg.nl-ams.scw.cloud/example",
  "region": "nl-ams",
  "credentials": {
    "scwSecretKeyFile": "/etc/cella/scw-secret-key"
  },
  "releaseCommand": {
    "enabled": true,
    "command": ["docker", "compose", "--profile", "backend", "run", "--rm", "migrate"]
  },
  "docker": { "composeFile": "/opt/app/compose.yml" },
  "files": {
    "compose": "...",
    "env": "...",
    "runtimeSecretManifest": [{ "envVar": "DATABASE_URL", "secretId": "...", "required": true }]
  },
  "timeouts": {
    "privateNetworkSeconds": 150,
    "pullAttempts": 12,
    "pullRetrySeconds": 10
  }
}
```

The plan should contain metadata and file contents, not runtime secret values. This preserves the current Secret Manager delivery model.

The one exception is the current Scaleway credential reality: VMs have no instance-attached identity, so a VM reader secret key is still needed for registry login and Secret Manager access. Do not put that key in the JSON plan. Cloud-init should write it separately to a root-only file such as `/etc/cella/scw-secret-key` with mode `0600`, and the plan should reference only that file path. The agent must never log this value, and cloud-init log scrubbing must still cover the launcher path.

Plan validation should be strict:

- Reject unsupported `schemaVersion`.
- Reject an `imageContract` that the local agent does not claim to support.
- Reject unknown top-level fields unless explicitly reserved.
- Reject command arrays that are empty or contain empty strings.
- Reject file paths outside the expected allowlist (`/opt/app`, `/etc/cella`, `/etc/runtime-secrets`).

### 3.3 Boot agent state machine

`cella-boot-agent boot --plan /etc/cella/boot-plan.json` should execute:

1. `waitForPrivateNetwork()`
2. `writeAppFiles()`
3. `dockerLogin()`
4. `hydrateRuntimeSecrets()`
5. `pullImage()`
6. `runReleaseCommand()` for `runMigrate` services
7. `startService()`
8. `writeBootResult()`

Every step should emit structured line logs to stdout, for example:

```json
{"level":"info","step":"pull-image","service":"backend","attempt":1}
```

The systemd unit should route stdout/stderr to journald and the serial console. This keeps the current no-SSH debugging path while making log parsing possible later.

### 3.4 Cloud-init after the change

Cloud-init should be reduced to:

1. Set up output teeing to `/var/log/cella-boot.log` and serial console.
2. Write `/etc/cella/boot-plan.json`.
3. Write `/etc/cella/scw-secret-key` mode `0600`.
4. Start `cella-boot-agent.service`.
5. Exit with the agent's status.

Keeping cloud-init as the tiny launcher is important. Scaleway still needs some userdata path to deliver release-specific data to a fresh VM.

The agent, not cloud-init, should write `/opt/app/compose.yml`, `/opt/app/.env`, `/etc/runtime-secrets/manifest.json`, and `/opt/app/.env.runtime`. That keeps all file validation and mode handling in TypeScript and leaves cloud-init with one testable job: deliver the plan plus credential file and run the unit.

## 4. What moves into TypeScript first

Implement only the code that already exists in bash/Python. Avoid adding broad PaaS behavior in this phase.

### 4.1 Move runtime-secret-sync first

Replace the embedded Python script in `infra/resources/cloud-init.ts` with a TypeScript implementation inside the boot agent.

Reasons:

- It has clear inputs and outputs.
- It already has a mirror implementation in `infra/tasks/assert-secrets-deliverable.ts` and `infra/lib/env-file.ts`.
- It caused a real outage class when multi-line secrets reached env files.
- It is easy to unit test with injected fetch.

Keep the same semantics:

- Required secret missing or unreadable: fail boot.
- Optional secret missing: skip.
- Present empty or multi-line value: fail boot.
- Write `/opt/app/.env.runtime` mode `0600`.

This intentionally tightens the current embedded Python behavior, which rejects multiline values but does not reject empty strings. The CI preflight already treats both as undeliverable through `infra/lib/env-file.ts`; the agent should use the same TypeScript predicate so CI and VM boot cannot drift again.

### 4.2 Move migrate orchestration second

The agent should not know about Cella migrations specifically. It should know about a generic release command:

```json
{
  "releaseCommand": {
    "enabled": true,
    "command": ["docker", "compose", "--profile", "backend", "run", "--rm", "migrate"]
  }
}
```

For Cella, `runMigrate: true` compiles into that release command. For future non-Cella apps, this becomes the equivalent of Heroku Release Phase, Fly `release_command`, Render pre-deploy command, or Dokku `Procfile release`.

### 4.3 Move image pull/start third

Once secret sync and release commands are stable, move pull/start logic. These steps are straightforward but must preserve the current retry behavior and the compose profile boundaries.

### 4.4 Defer machine checks

Machine checks are valuable, but do not add them in the first implementation. They interact with deploy sequencing and LB ownership. First replace existing boot behavior without adding new gates.

## 5. Required code changes

### 5.1 New package or module

Add an agent package, preferably `infra-agent/` or `infra/agent/`.

Recommended narrow choice: `infra/agent/` so it can share infra test tooling and stay private to this package initially.

Minimum files:

- `infra/agent/src/main.ts`
- `infra/agent/src/boot.ts`
- `infra/agent/src/plan.ts`
- `infra/agent/src/runtime-secrets.ts`
- `infra/agent/src/exec.ts`
- `infra/agent/package.json` only if we want a separately bundled artifact

Use minimal dependencies. Prefer Node built-ins: `fs/promises`, `node:child_process`, global `fetch`, `node:test` or existing Vitest tests. Do not pull in a web framework.

### 5.2 Bundle artifact

The image bake should install a built agent artifact. Two acceptable shapes:

1. **Plain JS plus Node runtime**: build with `tsup` or `tsc`, copy `dist/` into `/opt/cella-agent`, symlink `/usr/local/bin/cella-boot-agent`.
2. **Single-file executable JS**: bundle to one JS file and run with `/usr/bin/node`.

Do not use `tsx` on production VMs. The baked image should not depend on pnpm, source files, or workspace dev dependencies.

### 5.3 Packer changes

Extend `infra/image/compute-docker.pkr.hcl` to install Node 24 and the agent artifact.

Open design question: Packer builds from local repo contents, but the current template only runs shell commands on the temporary server. To copy the agent artifact, the image build needs either:

- a Packer `file` provisioner after a local build step, or
- a prebuilt release artifact URL, or
- installing from an npm package.

Narrow recommendation: local build plus Packer `file` provisioner. This keeps the agent version tied to the repo commit that baked the image.

### 5.4 General config changes

Replace the boolean-only image capability with an explicit image contract.

Current:

```ts
compute: {
  image: 'ubuntu_noble',
  dockerPreinstalled: false,
}
```

Proposed transitional shape:

```ts
compute: {
  image: '<scaleway-image-id>',
  imageContract: 'docker-node-agent-v1',
}
```

During migration, keep `dockerPreinstalled` but add tests that reject `imageContract: 'docker-node-agent-v1'` unless cloud-init uses the agent path.

Eventually delete `dockerPreinstalled`. A capability boolean is too weak once the image must guarantee Node and an agent too.

### 5.5 Cloud-init renderer changes

`renderCloudInit` should become a plan renderer plus agent launcher. Existing tests in `infra/resources/cloud-init.test.ts` need to change from asserting bash fragments to asserting:

- Boot plan contains release SHA.
- Boot plan contains compose/env/manifest contents.
- Script starts `cella-boot-agent boot --plan /etc/cella/boot-plan.json`.
- Script no longer embeds Python runtime-secret-sync.
- Script fails closed if the agent exits non-zero.
- Script still mirrors output to `/var/log/cella-boot.log` and serial console.

### 5.6 CI and image build documentation

Update `infra/README.md` after implementation to state that production requires the baked agent image. The current text says Docker is optional and cloud-init can install Docker from stock Ubuntu. That should become a development fallback only.

## 6. Tests

### 6.1 Unit tests

Agent tests:

- Parse and validate boot plan schema.
- Runtime secret hydration mirrors `assert-secrets-deliverable` semantics.
- Env-file writer rejects empty/multiline values.
- Release command failure returns non-zero and stops later steps.
- Pull retry honors attempt budget.
- Structured logs include service, release, and step.

Cloud-init tests:

- Renders boot plan heredoc.
- Starts agent systemd unit or agent command.
- Preserves serial-console logging.
- No longer embeds long bash migrate logic.

Packer/static tests:

- Template installs Node.
- Template installs or copies agent artifact.
- Template validates `node --version`, `cella-boot-agent --version`, Docker, and compose.
- Template validates the agent supports boot plan schema version 1.
- Template does not install `tsx`, pnpm, or workspace source files on the VM.

Credential and plan-contract tests:

- Cloud-init writes the Scaleway VM reader secret to `/etc/cella/scw-secret-key` mode `0600`.
- Boot plan references the credential file path and never embeds the secret value.
- Agent rejects unsupported `schemaVersion` and unsupported `imageContract`.
- Agent rejects empty command arrays, empty command arguments, and file paths outside the allowed boot paths.

### 6.2 Integration tests

Add a local agent integration test that runs against temp directories and mocked HTTP fetch for Secret Manager. Avoid Docker at first.

Later add a Docker integration test that uses a fake compose file and a fake profile to verify command ordering.

### 6.3 End-to-end tests

Do not require a live Scaleway image bake in normal `pnpm check`. Image baking should remain an explicit operator command.

Add a manual validation checklist to the plan:

1. Build agent locally.
2. Build image with Packer.
3. Run `cella-boot-agent --version` and the schema-support check inside the Packer validation phase.
4. Configure `compute.image` and `compute.imageContract` to the new image ID/contract.
5. Deploy one staging VM.
6. Confirm serial console shows agent steps.
7. Confirm backend health and `X-App-Version`.
8. Intentionally break one required staging secret and confirm boot fails before `docker compose up`.

## 7. Gaps and paradoxes found

### 7.1 README rollout architecture was cleaned up

`infra/README.md` now describes the current immutable-node deployment path and no longer documents the removed tag-bucket / VM-watcher / proxy-sidecar model. Before the cleanup, stale sections still described:

- Uploading image tags to a tag bucket.
- A VM-side watcher detecting tags.
- A per-VM proxy owning the LB-facing port.
- Backend rolled blue-green and optional VMs rolled in-place.
- A file structure that still lists `infra/reconciler/`.

That model no longer matches the code. The README has been corrected; keep future agent docs aligned with the same current state: immutable generations are active, and explicit `SetBackendServers` overlap is driven by `deploy-service.ts` / `cutover.ts`.

### 7.2 Cutover remains deploy-controller logic, not boot-agent logic

`cutover.ts` describes true LB overlap via direct `SetBackendServers`, and CI invokes it through `deploy-service.ts`. The load balancer ignores `serverIps` drift so Pulumi does not undo the live server list during the overlap window.

The boot agent must not pretend to solve this. It improves VM readiness and diagnostics; traffic handoff remains deploy-controller logic.

### 7.3 The image is optional today, but a Node agent makes it required

The current Packer work was framed as an optimization: skip Docker installation when pre-baked. A Node boot agent changes that into a dependency. This is acceptable, but it must be made explicit in config and docs. Optional image plus required agent is a contradiction.

### 7.4 Baked agent version versus app release version

The VM image has one lifecycle and the app image has another. If `cella-boot-agent` is baked into the VM image, a bug in the agent requires baking a new compute image and updating `compute.image`, not just deploying a new app SHA.

That is a maintenance cost. It is still preferable to editing complex cloud-init bash, but the image rebuild path must stay intentionally operated and documented.

### 7.5 Boot diagnostics still need a durable story

Serial console logging works but is awkward for CI and future SaaS UX. The previous S3 boot-diag reader exists, but the current VM reader key has no safe write permission to the state bucket. A durable log channel needs either:

- a dedicated boot-diagnostics bucket with a bucket policy granting VM write only to that bucket, or
- a control-plane pull/read path through Scaleway instance console if available, or
- external log shipping from the host.

Do not give the VM project-wide ObjectStorageFullAccess just to upload logs.

This is not optional for a robust deploy flow. It does not have to block the first local agent skeleton, but it should block production cutover to the agent path unless the team accepts serial-console-only diagnosis for that deployment.

Split diagnostics into two parts:

1. **Infrastructure plumbing can be implemented before the agent**: create a dedicated boot-diagnostics bucket, grant the VM reader application write access only to that bucket via bucket policy, and retarget `infra/tasks/diag.ts` / `fetch-boot-diag.ts` away from the Pulumi state bucket.
2. **The uploader should be TypeScript agent code**: the boot agent should write bounded boot result/log artifacts on success and failure. Do not grow `cloud-init.ts` with a new long-lived Python/bash uploader as the normal path. A temporary cloud-init uploader is acceptable only as an explicit emergency bridge, and should be deleted as soon as the agent owns diagnostics.

### 7.6 A long-lived agent reintroduces the old reconciler question

A first-boot agent is a replacement for cloud-init bash. A long-lived deploy agent is a replacement for the old reconciler and parts of GitHub Actions. That may be the right PaaS future, but it is a different project with different security and upgrade requirements.

Keep phase 1 first-boot only.

### 7.7 Exclusive services are not solved by the boot agent

`cdc` is `replacementStrategy: 'exclusive'`: it has no LB route and holds a single PostgreSQL replication slot. The boot agent can start the new process and expose health, but it cannot make exclusive handoff near-zero downtime by itself.

The current `deploy-service.ts` path for exclusive services directly promotes the new generation and runs `pulumi up`. `cutover.ts` contains slot-release vocabulary, but the live deploy task does not yet wire a Postgres slot gate or an old-generation drain callback for `cdc`. Treat that as deploy-controller work, separate from the boot agent. Do not move this logic into the agent unless the project deliberately chooses a long-lived deploy agent later.

## 8. Phased implementation plan

### Phase 0: doc and contract cleanup

- Keep `infra/README.md` aligned with the current immutable-generation deployment caveat.
- Add an explicit image contract type to `GeneralConfig`, even if initially only documented.
- Define the VM credential handoff contract: cloud-init writes `/etc/cella/scw-secret-key` mode `0600`, the plan references only that path, and the agent redacts it from all logs.
- Decide final path: `infra/agent/` versus a new workspace package.

### Phase 1: agent skeleton in repo

- Implement `cella-boot-agent --version`.
- Implement an agent schema-support command or flag for boot plan validation.
- Implement boot plan parsing and validation.
- Implement structured logger.
- Add unit tests.
- No cloud-init wiring yet.

### Phase 2: runtime secret sync in agent

- Port `runtimeSecretSyncScript` behavior to TypeScript.
- Share `infra/lib/env-file.ts` validation so empty and multiline values fail consistently in CI and on the VM.
- Add tests using injected fetch.
- Keep cloud-init using Python until tests pass.

### Phase 3: image bake includes Node and agent

- Build the agent artifact before Packer.
- Extend Packer with Node 24 installation.
- Copy agent artifact into image.
- Validate `node`, Docker, compose, `cella-boot-agent --version`, and schema-version support in Packer.
- Update `infra/README.md` image section.

### Phase 4: cloud-init launches agent for one service in staging

- Add plan rendering to `cloud-init.ts`.
- Behind a config flag or image contract, render agent launcher instead of Python/bash boot sequence.
- Keep cloud-init responsible only for teeing logs, writing the boot plan, writing the VM reader credential file, starting the systemd unit, and returning the agent status.
- Deploy to staging or a disposable stack.
- Verify serial console logs, secret hydration, image pull, migrate, and app health.

### Phase 4.5: durable boot diagnostics

- Add a dedicated boot-diagnostics bucket.
- Grant the VM reader application write access only to that bucket, not project-wide Object Storage write.
- Retarget `diag` and `fetch-boot-diag` to the diagnostics bucket.
- Make the TypeScript boot agent upload bounded boot result/log artifacts on success and failure.
- Keep cloud-init diagnostics limited to serial-console teeing during the transition; avoid adding a new Python/bash uploader unless explicitly choosing a short-lived emergency bridge.
- Add a deploy failure drill that proves CI/operator can retrieve agent failure logs without Scaleway web-console access.

### Phase 5: remove old boot implementation

- Delete embedded Python runtime-secret-sync.
- Delete Docker install fallback once required image contract is accepted.
- Delete bash migrate/pull/start blocks after the agent owns them.
- Update cloud-init tests to assert the small launcher contract.

### Phase 6: add release-command and machine-check vocabulary

- Generalize `runMigrate` into a release command.
- Add optional machine checks to the boot plan, but keep them disabled until deploy sequencing can consume their result.
- Revisit `infra/tasks/cutover.ts` wiring separately.

## 9. Product direction after the narrow implementation

Once the boot agent is stable, the reusable Scaleway PaaS shape becomes clearer:

- A base image with Docker, Node, and the agent.
- A manifest that declares images, processes, env, secrets, health checks, release commands, and optional machine checks.
- A deploy controller that provisions VMs, waits for agent readiness, moves LB traffic, and records deploy history.
- A SaaS/control plane that can approve, observe, and coordinate deploys without handling application traffic or storing customer secrets.

This matches documented PaaS patterns without copying their full architecture: Heroku/Dokku release phase, Fly `release_command` and machine checks, Render pre-deploy commands and health-gated instance replacement, and Kamal's host-level proxy cutover.

The useful near-term move is not to build all of that. It is to make the VM boot contract typed, tested, and image-backed.

## 10. Recommendation

Proceed with a required baked image and a first-boot TypeScript agent. Keep the first version boring:

- no HTTP server,
- no polling loop,
- no remote command API,
- no self-update,
- no generic PaaS manifest yet,
- no new LB cutover behavior.

The agent should only replace existing cloud-init behavior. That is narrow enough to avoid overengineering, but it creates the right foundation for a future Scaleway PaaS.