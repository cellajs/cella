# Architecture

This document explains how a Cella app fits together on [PostgreSQL](https://www.postgresql.org/docs/), [Hono](https://hono.dev/) and [TanStack Query](https://tanstack.com/query/latest): its services, entity hierarchy, trust boundaries, data lifecycle and scaling.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative web apps**.
PostgreSQL is the source of truth. The API's OpenAPI routes generate the typed SDK your React app uses. Entities are declared once. Permissions and tenant boundaries follow from them. TanStack Query keeps your data synced and available offline.

## Overview

Below is a typical production stack. Yjs, OAuth and MCP are optional. For staging or an app with few users, you can **run every service on the API machine** to save costs.

```
   ┌────────────────┐                        ┌──────────────────────────────┐
   │     Client     │ ◀────── HTTP ────────▶ │          API server          │
   │ TanStack Query │ ◀╌╌╌╌╌╌╌ SSE ╌╌╌╌╌╌╌╌╌ │         OpenAPI spec         │
   └────────────────┘                        └──────────────────────────────┘
          ▲                                      ▲                    ▲
          ╎ WS · Yjs updates                 SQL │                    ╎ WS · changes
          ▼                                      ▼                    ╎
   ┌──────────────┐           ┌────────────────────────┐            ┌─┴────────────────┐
   │  Yjs relay   │    SQL    │        Postgres        │    WAL     │       CDC        │
   │  (optional)  │ ◀────────▶│       (managed)        │╌╌╌╌╌╌╌╌╌╌╌▶│                  │
   │              │           │                        │◀───────────│                  │
   └──────────────┘           └────────────────────────┘    SQL     └──────────────────┘

   ── request/response    ╌╌ stream (WAL · WS · SSE)
```

## Cella's core philosophy

| Principle | What it means |
| --- | --- |
| **PostgreSQL holds the truth** | Business data, relationships, audit history, and sync ordering start in one database. |
| **OpenAPI defines the contract** | Hono routes with Zod schemas generate one OpenAPI 3.1 document, the source of the typed [SDK](../../sdk/README.md) and the API docs. Shared mocks serve docs, seeds, tests and load tests. |
| **TanStack Query holds server state** | Reads, optimistic writes, realtime changes, and restored offline data converge in one cache. |
| **One hierarchy configuration** | Configuration defines entities, their parents, roles, and the behavior derived from them. |
| **Services add capabilities** | Change data capture (CDC), the Yjs relay, OAuth, MCP and the jobs service run separately or alongside the API. |

Cella favors a narrow, opinionated stack: it simply needs React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle and Dexie. The default app is a client-rendered progressive web app (PWA) on open standards, deployable to European-owned cloud infrastructure through Scaleway and Pulumi.

## Entity hierarchy model

```
 ┌─ system ───────────────────────────────────────────────────────────────────────────────┐
 │                                                                                        │
 │                                      ┌─ tenant · resource ───────────────────────────┐ │
 │                                      │                                               │ │
 │ ┌──────────────────┐                 │  ┌─ organization · channel ────────────────┐  │ │
 │ │ user · entity    │── membership ───┼─▶│                                         │  │ │
 │ └──────────────────┘                 │  │  ┌───────────────────────────────────┐  │  │ │
 │                                      │  │  │ attachment · product              │  │  │ │
 │                                      │  │  └───────────────────────────────────┘  │  │ │
 │                                      │  └─────────────────────────────────────────┘  │ │
 │ other resources:                     │                                               │ │
 │ system role · request                │  other resources: api key · service account   │ │
 │                                      └───────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

| In the map | Kind | What it is |
| --- | --- | --- |
| user | user entity | A person, outside any tenant. Joins channels through memberships. |
| organization | channel entity | A place with roles and members. Other channels nest under the organization. |
| attachment | product entity | Content that always belongs to a channel and inherits its access. Syncs live and works offline. |
| tenant & more | resource | A tracked row outside the hierarchy. The tenant is the isolation and billing boundary. |

You declare entity hierarchy and relations in [hierarchy-config.ts](../../shared/config/hierarchy-config.ts). The template starts with just organizations and attachments. From the hierarchy the template derives:

- the id columns
- permission checks up the ancestor chain
- row-level security
- the CDC publication
- counters
- which clients receive a change
- navigation

## Selective sync engine

Channel entities stay conventional CRUD. Product entities get live updates and offline use through the same API and query cache ([Sync engine](./SYNC_ENGINE.md)).

## Trust boundaries

| Layer | Responsibility |
| --- | --- |
| **Sign-in** | Identify an account by a verified proof, not by its email address. |
| **Request guards** | Establish the actor, the tenant and the channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant and channel relationships coherent and identity columns immutable. |
| **Secret columns** | One registry, [secret-columns.ts](../../backend/src/db/secret-columns.ts), keeps secrets out of API responses, logs and CDC row images. |

The permission engine is in `shared/` so that different parts of the web app can use it.

## Data lifecycle

What a delete or an archive does depends on the entity:

- **Product**: a hidden tombstone until the deleted-items period ends.
- **Organization**: deleting it marks its tenant deleted and ends access at once.
- **Deleted tenant**: removed with everything in it after the deleted-tenant period, restorable until then.
- **Nested channel**: removed at once, with the channels and products in it.
- **Nested channel, archived**: readable, listed on request and closed to writes until unarchived.
- **Expiring rows**: Things like sessions, tokens, invitations are swept nightly.

Whichever way a row leaves, the files and collaborative document it stored go after it.

Your app sets every period in `appConfig.retention`. The nightly `retention` job removes rows past their period. Daily database backups and earlier versions of stored files are kept for the backup period. They serve disaster recovery only.

## Scaling

Cella is built and tested to handle small and medium-sized projects. It scales up and apart, not out: one API process per deployment keeps the design simple, which leaves room for the complexity of the sync engine.
- **Up**: a bigger machine for the API and a bigger managed database.
- **Apart**: each service moves to a machine of its own when the API machine gets busy.

Every service is a singleton. CDC holds the one replication slot, the jobs service the one scheduler.

The client carries work too. It keeps its own cache and fetches what the sync engine announces. The server spreads those fetches over time, and the readers of the same rows share one answer.

## Repository map

A flat-root monorepo. Frontend and backend features live in matching modules.

```text
.
├── backend       Hono API and the jobs, MCP and OAuth services, Drizzle schema, migrations, emails, seeds, and load tests
├── frontend      React SPA/PWA with TanStack Query client
├── shared        Hierarchy and entity config, permissions, types, translations, data files, and cross-tier utils
├── sdk           Generated OpenAPI client, types, and Zod schemas
├── cdc           PostgreSQL change data capture
├── yjs           Yjs relay for collaborative editing (optional)
└── cella         Docs, agent skills, changelog, upgrade alignments, and the app's side of the CLI tools, infra included
```
