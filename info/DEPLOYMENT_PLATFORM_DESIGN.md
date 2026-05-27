# Deployment Platform Design

## Overview

A **web-based deployment platform** for TypeScript/Node/Postgres monorepos on Scaleway. Built with the Cella template, it provides a secure, MFA-protected UI for managing deployments with human-in-the-loop approval for all production runs. The platform embeds a proven CI runner for job execution, managing all operational complexity so users only interact with a focused, secure web interface.

**Core Principle:** Minimal operational overhead. All secrets in Scaleway Secret Manager. Only Pulumi passphrase and Scaleway API keys required.

---

## Architecture

### High-Level Flow

```
User (web UI)
    ↓
Cella Frontend (React SPA + MFA)
    ↓
Cella Backend (Node.js API, Pulumi Automation)
    ↓
┌─────────────────┬──────────────────┬─────────────────┐
│ Embedded Runner │  Scaleway Secret │ Pulumi State    │
│ (Forgejo/WPC)   │  Manager         │ (Object Storage)│
└─────────────────┴──────────────────┴─────────────────┘
    ↓
Target Infrastructure (Scaleway)
```

### Key Components

#### 1. **Frontend (React SPA, Cella)**
- **MFA Login:** All users must authenticate with MFA (TOTP or similar).
- **Deploy Dashboard:** List deploys, view logs, check job status.
- **Approval Workflow:** UI modals for human approval of production deploys (MFA re-confirmation required).
- **Settings:** Manage secrets (API keys) and approval rules.
- **Audit Log:** View all platform actions (logins, approvals, deploys, errors).

#### 2. **Backend (Node.js API, Cella)**
- **Auth & MFA:** Validate user credentials, enforce MFA for sensitive actions.
- **Deploy Orchestration:** Accept deploy requests, schedule runner jobs, manage deploy state.
- **Runner Integration:** Communicate with the embedded runner (queue jobs, fetch logs, handle callbacks).
- **Pulumi Automation:** Use Pulumi Automation API to run stack updates, manage state.
- **Secrets Integration:** Fetch runtime secrets from Scaleway Secret Manager, inject into runner jobs.
- **Approval Engine:** Track and enforce approval requirements for production deploys.
- **Audit Logging:** Log all actions for compliance and debugging.

#### 3. **Runner (Embedded, Proven)**
- **Forgejo Actions Runner** (recommended) or **Woodpecker CI** agent.
- **Role:** Execute workflow jobs defined in the repo (e.g., `.forgejo/workflows/deploy.yml`).
- **Managed by Platform:** Backend provisions, configures, and monitors the runner.
- **Secrets Injection:** At job runtime, operational secrets are fetched from Scaleway Secret Manager and injected as environment variables.
- **Stateless:** Runner is ephemeral; jobs are queued and executed; logs are streamed to backend.

#### 4. **Scaleway Secret Manager**
- **Operational Secrets:** All env vars, DB credentials, API keys (except Pulumi passphrase and Scaleway access keys) are stored here.
- **Access Model:** Backend uses Scaleway API keys to authenticate and fetch secrets at runtime.
- **No Platform DB Secrets:** The platform database does not store operational secrets, only references to them.

#### 5. **Pulumi Automation API**
- **IaC Integration:** All infrastructure changes go through Pulumi stacks.
- **No CLI:** Pulumi is invoked programmatically from the backend via Automation API.
- **State Storage:** Pulumi state is stored in Scaleway Object Storage (S3-compatible).
- **Passphrase:** Pulumi state is encrypted with a passphrase, stored securely and injected at runtime.

---

## Security Model

### Secrets & Credentials

**Required Platform Secrets (3 total):**
1. **Pulumi Passphrase** – Encrypts Pulumi state.
2. **Scaleway Access Key** – API authentication.
3. **Scaleway Secret Key** – API authentication.

**Storage:** These are stored in a secure vault (e.g., local env vars or platform-specific secret storage during deployment). They are injected at runtime and never stored in the platform database.

**All Operational Secrets:** Live in Scaleway Secret Manager.
- Database credentials
- API keys for third-party services
- Environment variables for apps
- TLS certificates and keys

### Access Control

- **MFA Enforcement:** All logins and sensitive actions require MFA.
- **Production Approval:** All deploys to the production branch require explicit human approval in the UI (with MFA re-confirmation).
- **Role-Based Access:** Define roles (e.g., developer, approver, admin) with granular permissions.
- **Audit Log:** Every action is logged with user, timestamp, and outcome.

### Network Security

- **Platform Hosted on Scaleway:** Cella app runs on Scaleway Serverless Containers or Instances.
- **Runner Isolation:** Runner is co-located with the platform or in the same Scaleway project.
- **Secret Manager Access:** Only the backend communicates with Scaleway Secret Manager (never exposed to frontend or runner directly).

---

## User Workflows

### Workflow 1: Non-Production Deploy

1. User logs in via web UI (MFA required).
2. Selects a branch (e.g., `develop`, `feature/x`).
3. Clicks "Deploy" button.
4. Backend schedules a runner job to execute the workflow (e.g., `.forgejo/workflows/deploy.yml`).
5. Runner fetches secrets from Scaleway Secret Manager, executes the workflow.
6. Logs are streamed to the frontend in real-time.
7. Deploy succeeds or fails; user is notified.

### Workflow 2: Production Deploy (Human Approval Required)

1. User logs in via web UI (MFA required).
2. Selects the `production` branch.
3. Clicks "Deploy" button.
4. Backend creates a pending approval request.
5. Frontend shows a modal: "Approve production deploy? (Requires MFA confirmation)"
6. User re-confirms with MFA.
7. Backend logs the approval and schedules the runner job.
8. Runner executes the workflow with secrets from Scaleway Secret Manager.
9. Logs stream to frontend; user is notified on completion.

### Workflow 3: Infrastructure Update (Pulumi)

1. User updates infrastructure code in the repo (e.g., `infra/` folder).
2. Commits to a branch and pushes.
3. Platform detects the change (via webhook or polling).
4. Backend schedules a Pulumi preview job.
5. Preview shows proposed changes in the UI.
6. User approves the Pulumi update in the UI (MFA required).
7. Backend runs `pulumi up` via Automation API.
8. Pulumi state is updated and stored in Scaleway Object Storage.
9. User is notified.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Cella (React, TanStack Router/Query, Zustand) |
| **Backend** | Cella (Node.js, Hono, Drizzle ORM, PostgreSQL) |
| **Runner** | Forgejo Actions Runner or Woodpecker CI |
| **Secrets** | Scaleway Secret Manager |
| **IaC** | Pulumi (Automation API) |
| **State Storage** | Scaleway Object Storage |
| **Compute** | Scaleway Serverless Containers or Instances |
| **Database** | Scaleway Managed PostgreSQL |
| **CI Trigger** | Webhook or polling from repo |

---

## Implementation Sketch

### Backend Endpoints (Cella Hono API)

```typescript
// Authentication & MFA
POST /api/auth/login          // MFA check
POST /api/auth/verify-mfa     // Verify TOTP
GET  /api/auth/me             // Current user

// Deploys
GET  /api/deploys             // List deploys
POST /api/deploys             // Trigger deploy
GET  /api/deploys/:id         // Get deploy details
GET  /api/deploys/:id/logs    // Stream logs

// Approvals
GET  /api/approvals           // List pending approvals
POST /api/approvals/:id       // Approve production deploy
POST /api/approvals/:id/deny  // Deny production deploy

// Audit Log
GET  /api/audit-log           // List all actions

// Runner Management
GET  /api/runner/status       // Health check
POST /api/runner/queue        // Internal: queue a job

// Pulumi Integration
POST /api/infra/preview       // Preview infrastructure changes
POST /api/infra/update        // Apply infrastructure changes
GET  /api/infra/status        // Get Pulumi stack status
```

### Frontend Pages (Cella React Routes)

- `/` – Dashboard (if logged in)
- `/login` – MFA login page
- `/deploys` – Deploy history and status
- `/deploys/:id` – Deploy details with logs
- `/approvals` – Pending production approvals
- `/audit-log` – Audit log
- `/settings` – Platform settings (secrets, roles, rules)

### Database Schema (Cella Drizzle ORM)

```typescript
// Tables
users             // Platform users, hashed passwords, MFA secrets
mfa_sessions      // Active MFA sessions
deploys           // Deploy records (branch, status, timestamp)
deploy_logs       // Streaming logs for each deploy
approvals         // Approval requests and decisions
approval_decisions// MFA-confirmed approval records
audit_log         // All platform actions
secrets_refs      // References to Scaleway Secret Manager (names only)
```

### Runner Configuration

The runner (Forgejo Actions or Woodpecker) is provisioned and managed by the platform. Example job:

```yaml
# .forgejo/workflows/deploy.yml
name: Deploy
on:
  workflow_dispatch: { inputs: { branch: {} } }
jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ github.event.inputs.branch }}
      - run: pnpm install
      - run: pnpm deploy:infra  # Calls Pulumi via Automation API
      - run: pnpm deploy:app    # Deploys app code
    env:
      # Secrets injected by backend at runtime from Scaleway Secret Manager
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      API_KEY: ${{ secrets.API_KEY }}
```

### Runner Secrets Injection

1. Backend receives a deploy request.
2. Backend queries Scaleway Secret Manager for operational secrets.
3. Backend passes secrets to the runner as environment variables (or via runner API).
4. Runner injects secrets into the job environment.
5. Workflow steps access secrets as normal.

---

## Secrets Management Flow

```
┌──────────────────────────────────────────────────┐
│ Scaleway Secret Manager                          │
│ - DATABASE_URL                                   │
│ - API_KEY                                        │
│ - EMAIL_PASSWORD                                 │
│ (managed externally or via platform UI)          │
└────────────┬─────────────────────────────────────┘
             │ (Backend authenticates with Scaleway API keys)
             │
┌────────────▼─────────────────────────────────────┐
│ Cella Backend (Secure Runtime Environment)       │
│ - Fetches secrets from Scaleway Secret Manager   │
│ - Injects secrets into runner jobs               │
│ - Never stores secrets in platform database      │
└──────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────┐
│ Runner (Ephemeral Job Environment)               │
│ - Receives secrets as env vars                   │
│ - Uses secrets for deploy steps                  │
│ - Never persists secrets                         │
└──────────────────────────────────────────────────┘
```

---

## Deployment & Operations

### Platform Deployment (Self-Hosted on Scaleway)

1. **Cella Frontend:**
   - Deployed to Scaleway Serverless Containers or S3 + CDN.
   - Static assets (HTML, JS, CSS).

2. **Cella Backend:**
   - Deployed to Scaleway Serverless Containers or Instances.
   - Environment: PostgreSQL, Scaleway API keys, Pulumi passphrase (injected at runtime).

3. **Embedded Runner:**
   - Provisioned as a Docker container on Scaleway Instances or Serverless.
   - Registered with Forgejo (or Woodpecker) for job scheduling.
   - Fetches jobs from backend API.

4. **PostgreSQL:**
   - Scaleway Managed PostgreSQL for platform data.

5. **Object Storage:**
   - Scaleway Object Storage for Pulumi state and backups.

### Operational Secrets (Infrastructure Level)

These are only required at deployment time:
- `PULUMI_PASSPHRASE` – Injected into backend at startup.
- `SCALEWAY_ACCESS_KEY` – Injected into backend at startup.
- `SCALEWAY_SECRET_KEY` – Injected into backend at startup.

These can be stored in:
- Environment variables on the hosting platform.
- A CI/CD system (if deployed via CI).
- Local `.env` file (development only).

---

## Security Checklist

- [ ] MFA required for all logins.
- [ ] MFA re-confirmation required for production deploy approvals.
- [ ] All deploys to production logged and auditable.
- [ ] No operational secrets stored in platform database.
- [ ] Operational secrets fetched from Scaleway Secret Manager at runtime.
- [ ] Runner jobs are ephemeral and isolated.
- [ ] All platform actions logged with user, timestamp, outcome.
- [ ] HTTPS enforced for all communication.
- [ ] Backend only communication with Scaleway Secret Manager.
- [ ] Pulumi state encrypted and stored in Scaleway Object Storage.

---

## Future Enhancements

- **Notifications:** Email/Slack alerts on deploy success/failure.
- **Scheduled Deploys:** Allow scheduling deploys for off-peak times.
- **Multi-Repository:** Support multiple repos from the same platform instance.
- **Webhooks:** Trigger deploys on repo push events.
- **Rollback:** One-click rollback to previous deploy.
- **Custom Approval Rules:** Define who can approve, time restrictions, etc.
- **Cost Tracking:** Monitor Scaleway costs per deploy.

---

## Out of Scope (MVP+1 Product)

- CLI interface (UI-only).
- Preview environments (future iteration).
- Multi-cloud support (Scaleway only).
- Custom secret vault (use Scaleway Secret Manager).
- Direct runner UI (all interaction via platform UI).
- GitHub Actions support (Forgejo Actions or Woodpecker only).

---

## Summary

This platform delivers a **minimal, secure, production-ready deployment system** for TypeScript/Node/Postgres monorepos on Scaleway. It is built with the Cella template, requiring only a Pulumi passphrase and Scaleway API keys to operate. All operational secrets live in Scaleway Secret Manager. The UI enforces MFA everywhere and requires human approval for all production deploys. An embedded, proven runner handles job execution. No CLI, no custom secret vault, no MVP—just a full, focused product.
