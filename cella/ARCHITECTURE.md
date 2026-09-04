# Architecture

This document explains the basics of Cella.

### TL;DR

Cella is a **full-stack TypeScript project template for collaborative, content-rich web apps**. Most
feature work follows a familiar path: store rows in PostgreSQL, expose API endpoints, and read them
in React. Live updates, offline support, and tenant isolation are supported out-of-the-box.

## Overview

Below you see a typical full production stack. However, Yjs is optional and CDC and Yjs can be **cohosted on the backend VM** to reduce costs.

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
| **Workers add capabilities** | Change data capture (CDC) and Yjs workers run separately or alongside the API. |

Cella favors a narrow stack over replaceable abstractions: React, TanStack Router, TanStack Query, Zustand, Hono, Zod, Drizzle, and Dexie stay visible. The default app is a client-rendered progressive web app (PWA) on open standards, deployable to European-owned cloud infrastructure through Scaleway and Pulumi.

## Entity hierarchy model

| Concept | Meaning | Template example |
| --- | --- | --- |
| **Tenant** | Top-level isolation and billing boundary. A resource, not an entity | tenant |
| **Channel entity** | A place that owns memberships and roles | organization |
| **Product entity** | User-facing content that inherits access from a channel | attachment |
| **Resource** | Tracked data outside the entity hierarchy | session, token |

Code names: `ChannelEntityType` and `ProductEntityType`. `EntityType` covers both plus `user`. The template starts with `organization -> attachment`. The hierarchy is declared once in `shared/config/hierarchy-config.ts`. It drives permission traversal, schema helpers, navigation, counters, and stream dispatch. Frontend and backend features live in matching modules. Recipe: [New entity](./ADD_ENTITY.md).

## Selective sync engine

Channel entities stay conventional CRUD. Product entities get live updates and offline use without a very different API or cache model. Because an offline client may outlive a deployment, breaking entity-shape changes have an explicit evolution path. See [Sync engine](./SYNC_ENGINE.md), [Client (React)](./CLIENT.md) and [Schema evolution](./SCHEMA_EVOLUTION.md).

## Trust boundaries

Authentication supports magic links, passkeys, OAuth, and optional time-based one-time-password (TOTP). Sessions are cookie-based, hashed in storage, rate-limited, and support controlled system administrator impersonation. Cella has a layered approach to balance defense in depth, maintainability and performance.

| Layer | Responsibility |
| --- | --- |
| **Request guards** | Establish the authenticated tenant and channel context. |
| **Permission engine** | Decide whether the actor may create, read, update, or delete the subject. |
| **PostgreSQL row-level security** | Prevent tenant-scoped product reads from crossing the tenant boundary. |
| **Foreign keys and triggers** | Keep tenant/channel relationships coherent and identity columns immutable. |

The permission engine lives in `shared/`, so the API and the optional Yjs relay share one policy model. The frontend only shapes the interface with it. The backend is authoritative. See [Permissions](./PERMISSIONS.md) and [Multi-tenancy](./MULTI_TENANCY.md).

## Contracts and operations

Backend modules define Hono routes with Zod schemas. Those routes produce an OpenAPI 3.1 document, and the `sdk` workspace generates the fetch client, types, and validation schemas the frontend consumes. It also powers API docs and deterministic examples. Shared mocks serve docs, seeds, tests, and load tests.

Backend and other service workers share OpenTelemetry setup ([Observability](./OTEL.md)). CDC and Yjs are independent workers with health and shutdown contracts. Pulumi deploys to Scaleway through GitHub Actions ([infrastructure guide](../infra/README.md)).

Tests cover generated contracts, permission parity, cross-scope access, database constraints, sync catchup, and offline replay ([Testing](./TESTING.md)).

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
├── mcp           Optional Model Context Protocol service
├── infra         Pulumi deployment and operational CLI
├── cella         Architecture, guides, changelog, and upgrade migrations
├── locales       Translations
└── bench         Artillery load tests
```
