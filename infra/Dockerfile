# check=skip=InvalidDefaultArgInFrom
# The engine image: what every run of an environment's main job runs. The apply builds it from the tracked files of the operator's
# checkout (the root manifests, shared/ and infra/; tasks/publish-engine.ts stages them as the context), for linux/amd64, and pushes it
# to the environment's registry namespace; the job's definition names it by digest. NODE_IMAGE is the `node` bookworm image at the root
# `engines.node` by digest (git for the release check); ENGINE_MODE the environment; DESCRIPTION_HASH the hash of the description the
# apply computed. The build computes the hash again inside the image and refuses another one, then writes the stamp every run reads.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}

WORKDIR /engine

COPY package.json ./
RUN npm install -g --no-fund --no-audit "$(node -p "require('./package.json').packageManager.split('+')[0]")"

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY infra/package.json infra/
RUN pnpm install --frozen-lockfile --filter 'infra...' --filter 'shared...'

COPY shared shared
COPY infra infra

ARG ENGINE_MODE
ARG DESCRIPTION_HASH
RUN test -n "$ENGINE_MODE" && test -n "$DESCRIPTION_HASH" \
 && built="$(APP_MODE="$ENGINE_MODE" pnpm --silent --filter infra description-hash)" \
 && if [ "$built" != "$DESCRIPTION_HASH" ]; then \
      echo "The image describes $ENGINE_MODE as $built, the apply as $DESCRIPTION_HASH: an env override in the apply's shell (APP_ORIGIN, SINGLE_VM), or a file the checkout does not track." >&2; \
      exit 1; \
    fi \
 && printf '{"mode":"%s","descriptionHash":"%s"}\n' "$ENGINE_MODE" "$built" > /engine/stamp.json
