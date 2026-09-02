# Architecture

This document explains the basics of Cella.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative, content-rich web apps**. Most
feature work follows a familiar path: store rows in PostgreSQL, expose API endpoints, and read them
in React. Live updates, offline support, and tenant isolation build on that path.

## Overview

Full production stack; Yjs is optional, and CDC and Yjs can be **cohosted on the backend VM**.

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
| **One hierarchy describes the product** | Configuration defines entities, their parents, roles, and the behavior derived from them. |
| **Workers add capabilities** | Change data capture (CDC) and Yjs collaboration run separately or alongside the API without changing feature code. |

Cella favors a narrow stack over replaceable abstractions: React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle, and Dexie stay visible. The default app is a client-rendered progressive web app (PWA) on open standards, deployable to European-owned cloud infrastructure through Scaleway and Pulumi.

## Entity hierarchy model

| Concept | Meaning | Template example |
| --- | --- | --- |
| **Tenant** | Top-level isolation and billing boundary; a resource, not an entity | tenant |
| **Channel entity** | A place that owns memberships and roles | organization |
| **Product entity** | User-facing content that inherits access from a channel | attachment |
| **Resource** | Tracked data outside the entity hierarchy | session, token |

Code names: `ChannelEntityType`, `ProductEntityType`; `EntityType` covers both plus `user`. The template starts with `organization -> attachment`. The hierarchy is declared once in `shared/config/hierarchy-config.ts`:

```ts
createEntityHierarchy(roles)
  .user()
  .channel("organization", { parent: null, roles: roles.all })
  .product("attachment", { parent: "organization" })
  .build();
```

It drives permission traversal, schema helpers, navigation, counters, and stream dispatch; frontend and backend features live in matching modules. Structural rule: every product belongs to a channel, carries its tenant identity, and stays connected to its root channel through database constraints; change the hierarchy and schema together. Recipe: [New entity](./ADD_ENTITY.md).

## Selective sync engine

Channel entities stay conventional; product entities can opt into live updates and offline use without changing their API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path. See [Client](./CLIENT.md), [Sync engine](./SYNC_ENGINE.md), and [Schema evolution](./SCHEMA_EVOLUTION.md).

## Trust boundaries

Authentication supports magic links, passkeys, OAuth, and optional time-based one-time-password MFA. Sessions are cookie-based, hashed in storage, rate-limited, and support controlled system administrator impersonation. Authorization and isolation are separate layers:

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the authenticated tenant and channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |

The permission engine lives in `shared/`, so the API and the optional Yjs relay share one policy model; the frontend only shapes the interface with it, the backend is authoritative. Row-level security (RLS) only blocks cross-tenant product reads; application authorization still governs writes, channel entities, and memberships. See [Permissions](./PERMISSIONS.md) and [Multi-tenancy](./MULTI_TENANCY.md).

## Contracts and operations

Backend modules define Hono routes with Zod schemas. Those routes produce an OpenAPI 3.1 document, and the `sdk` workspace generates the fetch client, types, and validation schemas the frontend consumes. It also powers API docs and deterministic examples; shared mocks serve docs, seeds, tests, and load tests.

A backend module declares its capabilities once in `defineBackendModule` (mutation handlers, Yjs materializers, scheduled jobs); app-owned table lists for partitioning and grants live in the pinned `backend/src/db/product-tables.ts`, keeping side-effect migrations and the API entrypoint cella-owned. Node services share OpenTelemetry setup ([Observability](./OTEL.md)); CDC and Yjs are independent workers with health and shutdown contracts; Pulumi deploys to Scaleway through GitHub Actions ([infrastructure guide](../infra/README.md)).

Tests cover generated contracts, permission parity, cross-scope access, database constraints, sync catchup, and offline replay ([Testing](./TESTING.md)).

## Repository map

Flat-root monorepo:

```text
.
├── backend       Hono API, Drizzle schema, migrations, emails, and seeds
├── frontend      React SPA/PWA and browser-side data layer
├── shared        Entity config, permissions, types, and cross-tier utilities
├── sdk           Generated OpenAPI client, types, and Zod schemas
├── cdc           PostgreSQL change-data-capture worker
├── yjs           Optional collaborative-editing relay
├── mcp           Optional Model Context Protocol service
├── infra         Pulumi deployment and operational CLI
├── cella         Architecture, guides, changelog, and upgrade migrations
├── locales       Translations
└── bench         Artillery load tests
```
