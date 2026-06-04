# Production frontend reverse-proxy image.
#
# Tiny wrapper around the upstream Caddy image that bakes in our SPA Caddyfile
# and stamps RELEASE_SHA into an env var. The Caddyfile reads it as
# {$RELEASE_SHA} at startup and emits it on every response as X-App-Version,
# which the on-VM reconciler uses to confirm a cutover completed.
#
# Build context is the repo root (same as backend/cdc/yjs). Example:
#   docker build -f infra/caddy/Dockerfile --build-arg RELEASE_SHA=$GIT_SHA .

FROM caddy:2.8-alpine

ARG RELEASE_SHA=dev
ENV RELEASE_SHA=${RELEASE_SHA}

COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
