# check=skip=InvalidDefaultArgInFrom
# The agent: the infra-agent Compose service every machine runs. It boots the
# machine's release (the env file, the archives, compose up with the migrate
# companion), then answers the load balancer's health checks and drains on
# its manifest's order. It ships as an archive of the release, which the
# launcher checks against its digest and loads at the first boot.
#
# It drives the HOST Docker daemon through the mounted socket
# (/var/run/docker.sock), so it needs the docker CLI + compose plugin; the
# launcher runs Compose from this image too. It runs on the host network and
# probes the private network via `ip route`, so it needs iproute2. The JS
# bundle is produced on the host by `pnpm --filter infra agent:build`
# (rolldown -> agent/dist/entry.cjs) before `docker build` (context:
# infra/agent). NODE_VERSION is the root package.json `engines.node`, passed by
# `agent:image`; without a default, so the `check=skip` line on top. The
# release bake passes NODE_IMAGE, the `node` image at that version by digest
# from infra/lib/deploy/node-image.ts, which a Node bump refreshes.
ARG NODE_VERSION
ARG NODE_IMAGE=node:${NODE_VERSION}-bookworm-slim
FROM ${NODE_IMAGE}

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg iproute2 \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

COPY dist/entry.cjs /app/agent.cjs

ENTRYPOINT ["node", "/app/agent.cjs"]
