FROM node:20-alpine AS alpine

# This Dockerfile is copy-pasted into our main docs at /docs/handbook/deploying-with-docker.
# Make sure you update both files!

# Setup pnpm and turbo on the alpine base
FROM alpine as base
RUN yarn global add pnpm turbo
RUN pnpm config set store-dir ~/.pnpm-store

FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
RUN apk update
# Set working directory
WORKDIR /app
COPY . .
RUN turbo prune frontend --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install --ignore-scripts

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.json tsconfig.json

# Uncomment and use build args to enable remote caching
# ARG TURBO_TEAM
# ENV TURBO_TEAM=$TURBO_TEAM

# ARG TURBO_TOKEN
# ENV TURBO_TOKEN=$TURBO_TOKEN

RUN pnpm turbo build:dev --filter=frontend...

FROM base AS runner
WORKDIR /app

# Don't run production as root
# RUN addgroup --system --gid 1001 frontend
# RUN adduser --system --uid 1001 frontend
# USER frontend
COPY --from=installer /app .

CMD cd frontend && pnpm run dev