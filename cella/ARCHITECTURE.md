# Architecture

This document explains the basics of Cella.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative, content-rich web apps**.
PostgreSQL is the source of truth. A Hono API defines validated OpenAPI routes and generates the typed SDK used by the React app. Shared hierarchy configuration drives permissions and tenant boundaries, while TanStack Query keeps data synced and available offline.

## Overview

Below is a typical production stack. Yjs, OAuth and MCP are optional, and every worker can be **cohosted on the backend VM** to reduce costs.

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

Cella favors a narrow stack over replaceable abstractions: React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle, and Dexie stay visible. The default app is a client-rendered progressive web app (PWA) on open standards, deployable to European-owned cloud infrastructure through Scaleway and Pulumi.

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

The hierarchy is declared once, in [hierarchy-config.ts](../shared/config/hierarchy-config.ts); the template starts with `organization -> attachment`. From it the template derives the id columns, permission checks up the ancestor chain, row-level security, the CDC publication, counters, which streams hear a change, and navigation. Frontend and backend features live in matching modules.

## Selective sync engine

Channel entities stay conventional CRUD. Product entities get live updates and offline use without a very different API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path.

## Trust boundaries

Accounts are identified by verified proofs, not email addresses.

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the actor (a person or a service account), the tenant and the channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |
| **Secret columns** | One registry ([secret-columns.ts](../backend/src/db/secret-columns.ts)) keeps secrets out of API responses, logs and CDC row images. |

The permission engine lives in `shared/`, so the API and the optional Yjs relay share one policy model. The frontend only shapes the interface with it; the backend decides.

## Data lifecycle

What a delete does depends on what is deleted:

- **Product**: becomes a tombstone, hidden everywhere: sync hands a device only its id and place, so the device drops it. It is removed after the deleted-items period; until then a system admin can restore it, and the app has no restore.
- **Organization**: its tenant is archived, as at the end of a contract. Everyone loses access at once, apart from a file link already handed out, which works for up to two hours. After the archived period it goes with everything in it.
- **Channel below the organization**: removed at once, with the channels and products in it.
- **Rows with a period** (session, token, device, invitation): swept nightly after it.

Whichever way a row leaves, the files and collaborative document it stored go after it.

Every period lives in `appConfig.retention`, the same for every tenant, and the privacy page states them. Where the database provider allows pg_cron, a nightly job in the database removes the rows past their period, archived tenants aside; on Scaleway it stays unscheduled ([Deployment](./DEPLOYMENT.md#overview)). Backups and bucket object versions expire on their own schedule.

## Contracts

Backend modules define Hono routes with Zod schemas, which generate an OpenAPI 3.1 document. It feeds the [sdk](../sdk/README.md) and the API docs. Shared mocks serve docs, seeds, tests, and load tests.

## Scaling

Cella runs one API process per deployment and scales up and apart, not out. The CDC worker hands every change to one process, and that process holds every stream. Up: a bigger VM for the API and a bigger managed database. Apart: each worker moves to a VM of its own when the API's VM gets busy. Every worker is a singleton: the CDC worker holds the one replication slot, the jobs worker the one scheduler.

The client carries work too: it keeps its own cache, the sync engine notifies and lets clients fetch, and the server spreads those fetches over time.

## Repository map

Flat-root monorepo:

```text
.
├── backend       Hono API, Drizzle schema, migrations, emails, and seeds
├── frontend      React SPA/PWA with React Query client
├── shared        Hierarchy and entity config, permissions, types, and cross-tier utils
├── sdk           Generated OpenAPI client, types, and Zod schemas
├── cdc           PostgreSQL change-data-capture worker
├── yjs           Optional collaborative-editing relay
├── mcp           Optional Model Context Protocol worker
├── oauth         Optional OAuth authorization server worker
├── jobs          Jobs worker: cron and queues on pg-boss
├── infra         Pulumi deployment and operational CLI
├── cella         Architecture, guides, changelog, and upgrade migrations
├── locales       Translations
└── bench         Load tests with their own runner
```
