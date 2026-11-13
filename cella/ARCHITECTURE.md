# Architecture

This document explains the basics of Cella.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative web apps**.
PostgreSQL is the source of truth. A Hono API defines validated OpenAPI routes and generates the typed SDK used by the React app. Shared hierarchy configuration drives permissions and tenant boundaries, while TanStack Query keeps data synced and available offline.

## Overview

Below is a typical production stack. Yjs, OAuth and MCP are optional. Every worker can be **cohosted on the backend machine** to reduce costs.

```
   ┌──────────────┐                          ┌──────────────────────────────┐
   │    Client    │ ◀─────── HTTP ─────────▶ │          API server          │
   │ React Query  │ ◀╌╌╌╌╌╌╌╌ SSE ╌╌╌╌╌╌╌╌╌╌ │         OpenAPI spec         │
   └──────────────┘                          └──────────────────────────────┘
          ▲                                      ▲                    ▲
          ╎ WS · Yjs updates                 SQL │                    ╎ WS · changes
          ▼                                      ▼                    ╎
   ┌──────────────┐           ┌────────────────────────┐            ┌─┴────────────────┐
   │  Yjs worker  │    SQL    │        Postgres        │    WAL     │    CDC worker    │
   │  (optional)  │ ◀────────▶│       (managed)        │╌╌╌╌╌╌╌╌╌╌╌▶│                  │
   │              │           │                        │◀───────────│                  │
   └──────────────┘           └────────────────────────┘    SQL     └──────────────────┘

   ── request/response    ╌╌ stream (WAL · WS · SSE)
```

## Cella's core philosophy

| Anchor | Promise |
| --- | --- |
| **PostgreSQL owns truth** | Business data, relationships, audit history, and sync ordering start in one database. |
| **OpenAPI owns the contract** | Zod-backed Hono routes generate the typed SDK used by the React app and external clients. |
| **TanStack Query owns server state** | Reads, optimistic writes, realtime changes, and restored offline data converge in one cache. |
| **One hierarchy configuration** | Configuration defines entities, their parents, roles, and the behavior derived from them. |
| **Workers add capabilities** | Change data capture (CDC), Yjs, OAuth, MCP and jobs workers run separately or alongside the API. |

Cella favors a narrow stack over replaceable abstractions. React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle and Dexie stay visible. The default app is a client-rendered progressive web app (PWA) on open standards, deployable to European-owned cloud infrastructure through Scaleway and Pulumi.

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

| In the map | Kind | Key characteristics |
| --- | --- | --- |
| user | user entity | A person, outside any tenant. Joins channels through memberships. |
| organization | channel entity | A place with roles and members. Other channels nest under the organization. |
| attachment | product entity | Content that always belongs to a channel and inherits its access. Syncs live and works offline. |
| tenant & more | resource | A tracked row outside the hierarchy. The tenant is the isolation and billing boundary. |

The hierarchy is declared once, in [hierarchy-config.ts](../shared/config/hierarchy-config.ts). The template starts with `organization -> attachment`. From the hierarchy the template derives:

- the id columns
- permission checks up the ancestor chain
- row-level security
- the CDC publication
- counters
- which streams hear a change
- navigation

Frontend and backend features live in matching modules.

## Selective sync engine

Channel entities stay conventional CRUD. Product entities get live updates and offline use without a very different API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path.

## Trust boundaries

Accounts are identified by verified proofs, not email addresses.

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the actor, the tenant and the channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |
| **Secret columns** | One registry, [secret-columns.ts](../backend/src/db/secret-columns.ts), keeps secrets out of API responses, logs and CDC row images. |

The API and the optional Yjs relay share one permission engine in `shared/`. The frontend only shapes the interface with it. The backend decides.

## Data lifecycle

What a delete or an archive does depends on the entity:

- **Product**: a hidden tombstone until the deleted-items period ends.
- **Organization**: deleting it archives its tenant and ends access at once.
- **Archived tenant**: removed with everything in it after the archived period.
- **Nested channel**: removed at once, with the channels and products in it.
- **Nested channel, archived**: readable, listed on request and closed to writes until unarchived.
- **Rows with a period**: sessions, tokens, devices, API keys, passkey challenges, OIDC payloads, requests, invitations, rate limits and push subscriptions are swept nightly after it.
- **Counters**: those of a removed channel or product are swept nightly.
- **Row of an owned embedding**: deleted as a product once no host references it and its period has passed.

Whichever way a row leaves, the files and collaborative document it stored go after it.

Every period lives in `appConfig.retention` and holds for every tenant. The privacy page states them. The jobs worker's nightly `retention` job calls `apply_retention()` over the admin connection, which removes rows past their period. Backups and bucket object versions expire on their own schedule.

## Contracts

Backend modules define Hono routes with Zod schemas. Together they generate an OpenAPI 3.1 document for the [sdk](../sdk/README.md) and the API docs. Shared mocks serve docs, seeds, tests and load tests.

## Scaling

An app runs one API process per deployment and scales up and apart, not out. The CDC worker hands every change to one process. That process holds every stream.

Up: a bigger machine for the API and a bigger managed database. Apart: each worker moves to a machine of its own when the API's machine gets busy.

Every worker is a singleton. The CDC worker holds the one replication slot, the jobs worker the one scheduler.

The client carries work too. It keeps its own cache and fetches what the sync engine announces. The server spreads those fetches over time.

## Repository map

Flat-root monorepo:

```text
.
├── backend       Hono API and the jobs, MCP and OAuth services, Drizzle schema, migrations, emails, seeds, and load tests
├── frontend      React SPA/PWA with React Query client
├── shared        Hierarchy and entity config, permissions, types, translations, data files, and cross-tier utils
├── sdk           Generated OpenAPI client, types, and Zod schemas
├── cdc           PostgreSQL change-data-capture worker
├── yjs           Optional collaborative-editing relay
├── infra         Deploy engine and the infra CLI
└── cella         Architecture, guides, changelog, and upgrade migrations
```
