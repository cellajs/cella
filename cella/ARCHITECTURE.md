# Architecture

Cella keeps ordinary feature work ordinary: PostgreSQL rows, OpenAPI endpoints, and TanStack Query hooks. Realtime updates, offline durability, generated contracts, and tenant isolation **fit around that path** instead of introducing a second application model.

It is a full-stack TypeScript monorepo for content-rich, collaborative applications people use every day. The template is deliberately opinionated about the seams between client, API, and database, while its modules and entity hierarchy can be reshaped by each project built from the template.

## Overview

This diagram shows the normal production topology of a Cella app. Your own setup could be different since you can choose to add or remove workers or 'cohost' them into a single backend VM.

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

Five choices give the architecture its shape:

| Anchor | Promise |
| --- | --- |
| **PostgreSQL owns truth** | Business data, relationships, audit history, and sync ordering start in one database. |
| **OpenAPI owns the contract** | Zod-backed Hono routes generate the typed SDK used by the React app and external clients. |
| **TanStack Query owns server state** | Reads, optimistic writes, realtime changes, and restored offline data converge in one cache. |
| **One hierarchy describes the product** | Configuration defines entities, their parents, roles, and the behavior derived from them. |
| **Workers add capabilities** | Change data capture (CDC) and Yjs collaboration can run separately or alongside the API without changing feature code. |

Cella favors a narrow stack over replaceable abstractions. Libraries remain visible and useful: React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle, and Dexie do the work their communities designed them to do. The result is easier to understand, easier to slim down, and less surprising to extend.

The default app is a client-rendered progressive web app (PWA). It uses open standards, supports European-owned cloud infrastructure through Scaleway and Pulumi, and leaves room for projects to cohost services, remove optional modules, or add static generation.

## Entity hierarchy model

Cella separates the product hierarchy from supporting resources:

| Concept | Meaning | Template example |
| --- | --- | --- |
| **Tenant** | Top-level isolation and billing boundary; a resource, not an entity | tenant |
| **Channel entity** | A place that owns memberships and roles | organization |
| **Product entity** | User-facing content that inherits access from a channel | attachment |
| **Resource** | Tracked data outside the entity hierarchy | session, token |

The code names are `ChannelEntityType` and `ProductEntityType`. `EntityType` covers both plus `user`. The template starts with `organization -> attachment`; projects commonly add deeper channels and more product types.

The hierarchy is declared once in `shared/config/hierarchy-config.ts`:

```ts
createEntityHierarchy(roles)
  .user()
  .channel("organization", { parent: null, roles: roles.all })
  .product("attachment", { parent: "organization" })
  .build();
```

That configuration drives permission traversal, schema helpers, navigation, counters, and stream dispatch. Frontend and backend features are organized into matching modules, which keeps business logic discoverable and lets projects retain upstream improvements with less friction.

One structural rule matters most when extending the model: every product belongs to a channel, carries its tenant identity, and stays connected to its root channel through database constraints. Change the hierarchy and schema together. The worked recipe lives in [New entity](./ADD_ENTITY.md).

## Selective sync engine

Sync is selective. A `channel` entity stay conventional, while `product` entities can opt into live updates and offline use without changing their API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path.

Read [React Client](./CLIENT.md) for state ownership, startup, IndexedDB, and multi-tab behavior. Read [Sync engine](./SYNC_ENGINE.md) for delivery and merge guarantees, and [Schema evolution](./SCHEMA_EVOLUTION.md) for version-tolerant changes.

## Trust boundaries

Authentication supports magic links, passkeys, OAuth, and optional time-based one-time-password MFA. Sessions are cookie-based, hashed in storage, rate-limited, and can support controlled system administrator impersonation.

After authentication, Cella separates authorization from isolation:

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the authenticated tenant and channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |

The permission engine lives in `shared/`, so the API and optional Yjs relay make decisions from the same policy model. The frontend uses those decisions to shape the interface, but the backend is always authoritative.

Row-level security (RLS) is intentionally narrower. It blocks cross-tenant product reads but does not replace application authorization, especially for writes. Channel entities and memberships remain application-authorized and do not use RLS.

Read [Permissions](./PERMISSIONS.md) for contextual roles and row conditions. Read [Multi-tenancy](./multi_tenancy.md) for database scope, write boundaries, and extension rules.

## Contracts and operations

Backend modules define Hono routes with Zod schemas. Those routes produce an OpenAPI 3.1 document, and the `sdk` workspace generates the fetch client, types, and validation schemas consumed by the frontend. The contract also powers API documentation and deterministic examples, while shared mocks serve documentation, seeds, tests, and load tests.

Operational concerns follow the same modular shape. Node services share OpenTelemetry setup for traces, metrics, and logs. PostgreSQL CDC and Yjs collaboration are independent workers with health and shutdown contracts. Pulumi deploys the services to Scaleway, with GitHub Actions providing the delivery path. See [Observability](./OTEL.md) and the [infrastructure guide](../infra/README.md) for those deeper views.

The test suite covers ordinary feature behavior as well as the seams that make this architecture safe: generated contracts, permission parity, cross-scope access, database constraints, sync catchup, and offline replay. See [Testing](./TESTING.md) for the available test modes.

## Repository map

Cella is a flat-root monorepo. The top-level folders reveal the service boundaries:

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

## Deep dives

| Continue with | When you need to understand... |
| --- | --- |
| [React Client](./CLIENT.md) | TanStack Query, IndexedDB, Zustand, startup, and tabs |
| [Sync engine](./SYNC_ENGINE.md) | Realtime delivery, catchup, offline writes, and guarantees |
| [Permissions](./PERMISSIONS.md) | Roles, contextual grants, public reads, and row conditions |
| [Multi-tenancy](./multi_tenancy.md) | Database visibility, write safeguards, and PostgreSQL roles |
| [Schema evolution](./SCHEMA_EVOLUTION.md) | Changing cached wire shapes across old clients |
| [Observability](./OTEL.md) | Traces, logs, metrics, health, and shutdown |
| [CDC worker](../cdc/README.md) | Logical replication and ordered side effects |
| [Yjs worker](../yjs/README.md) | Collaborative editing and materialization |
| [New entity](./ADD_ENTITY.md) | Adding a channel or product type to a project |
| [Testing](./TESTING.md) | Test modes, infrastructure, and contributor workflow |
