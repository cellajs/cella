# Architecture

This document explains the basics of Cella.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative, content-rich web apps**.
PostgreSQL is the source of truth. A Hono API defines validated OpenAPI routes and generates the typed SDK used by the React app. Shared hierarchy configuration drives permissions and tenant boundaries, while TanStack Query keeps data synced and available offline.

## Overview

Below you see a typical full production stack. However, Yjs, OAuth and MCP are optional (only Yjs is shown below for readability), and every worker can be **cohosted on the backend VM** to reduce costs.

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
   └──────────────┘           └────────────────────────┘ SQL · seq  └──────────────────┘

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

| Concept | Meaning | Template example |
| --- | --- | --- |
| **Tenant** | Top-level isolation and billing boundary. A resource, not an entity | tenant |
| **Channel entity** | A place that owns memberships and roles | organization |
| **Product entity** | User-facing content that inherits access from a channel | attachment |
| **Resource** | Tracked data outside the entity hierarchy | session, token |

Code names are `ChannelEntityType` and `ProductEntityType`. `EntityType` covers both plus `user`. The template starts with `organization -> attachment`. The hierarchy is declared once in `shared/config/hierarchy-config.ts`. It drives permission traversal, schema helpers, navigation, counters, and stream dispatch. Frontend and backend features live in matching modules. Guide: [New entity](./ADD_ENTITY.md).

## Selective sync engine

Channel entities stay conventional CRUD. Product entities get live updates and offline use without a very different API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path. See [Sync engine](./SYNC_ENGINE.md), [Client (React)](./CLIENT.md) and [Schema evolution](./SCHEMA_EVOLUTION.md).

## Trust boundaries

Authentication explains how people prove identity; [Interoperability](./INTEROPERABILITY.md) covers service accounts and machine access. Accounts are identified by verified proofs, not email addresses. See [Authentication](./AUTHENTICATION.md), [Permissions](./PERMISSIONS.md), and [Multi-tenancy](./MULTI_TENANCY.md).

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the actor (a person or a service account), the tenant and the channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |
| **Secret columns** | A single registry keeps secrets out of API responses, backend and worker logs, and CDC row images. |

The permission engine lives in `shared/`, so the API and the optional Yjs relay share one policy model. The frontend only shapes the interface with it. The backend is authoritative. See [Permissions](./PERMISSIONS.md) and [Multi-tenancy](./MULTI_TENANCY.md).

## Contracts and operations

Backend modules define Hono routes with Zod schemas, which generate an OpenAPI 3.1 document. The `sdk` package uses that document to generate the fetch client, TypeScript types, and validation schemas consumed by the frontend. It also powers API docs and deterministic examples. Shared mocks serve docs, seeds, tests, and load tests.

The backend and its workers share OpenTelemetry setup ([Observability](./OTEL.md)). CDC, Yjs, OAuth, MCP and jobs are independent workers with health and shutdown contracts. Pulumi deploys to Scaleway through GitHub Actions ([infrastructure guide](../infra/README.md)).

Tests cover generated contracts, permission parity, cross-scope access, database constraints, sync catchup, and offline replay ([Testing](./TESTING.md)).

## Scaling

Cella runs one API process per deployment and scales up and apart, not out. Up: a bigger VM for the API and a bigger managed database. Apart: each worker (CDC, Yjs, OAuth, MCP, jobs) moves to a VM of its own when the API's VM gets busy, and each is a singleton: the CDC worker holds the one replication slot, the jobs worker the one scheduler. The client carries work too: it keeps its own cache, the sync engine notifies and lets clients fetch, and the server spreads those fetches over time.

A second API process is not part of the design. The CDC worker hands every change to one API process over one socket, and that process holds every SSE stream, drops its caches on each change and ends the streams when the sync books move to a new generation. A second process would hear none of it: its clients would learn of changes only at reconnect, and its caches would go stale. Running the API on more than one process would need a bus between them for the worker's changes, and the infra has no option for it. A deploy overlap is the one moment two API processes exist; [Deployment](./DEPLOYMENT.md#rollout-strategies) says what that costs.

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
└── bench         Artillery load tests
```
