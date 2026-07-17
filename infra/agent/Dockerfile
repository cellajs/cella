# Cella boot agent: runs at VM first-boot via `docker run` to bring a service's
# Docker Compose stack up. The agent ships as a normal registry image pulled at boot.
#
# It drives the HOST Docker daemon through the mounted socket
# (/var/run/docker.sock), so it needs the docker CLI + compose plugin. The agent
# also runs with --network host and probes the private network via `ip route`,
# so it needs iproute2. The agent JS bundle is produced on the host by
# `pnpm --filter infra agent:build` (tsup → agent/dist/entry.cjs) before
# `docker build` (context: infra/agent).
FROM node:24-bookworm-slim

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
