# Production frontend reverse-proxy image.
#
# Tiny wrapper around the upstream Caddy image that bakes in our SPA Caddyfile
# and stamps RELEASE_SHA into an env var. The Caddyfile reads it as
# {$RELEASE_SHA} at startup and emits it on every response as X-App-Version,
# which CI uses to confirm the expected release is serving.
#
# Build context is the repo root (same as backend/cdc/yjs). Example:
#   docker build -f infra/caddy/Dockerfile --build-arg RELEASE_SHA=$GIT_SHA .

# By digest, as a tag moves. A Caddy bump takes the index digest that
# `docker buildx imagetools inspect caddy:<version>-alpine` prints.
FROM caddy:2.11.7-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f

ARG RELEASE_SHA=dev
ENV RELEASE_SHA=${RELEASE_SHA}

COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
