# Intake

Three lists name the attacks the classes review. An intake reads every item of a list and writes one row for it. The classes then run on the rows that name a lead.

| List | Items | What an item names | Last read |
| --- | --- | --- | --- |
| OWASP cheat sheets | every file in `cheatsheets/` of [OWASP/CheatSheetSeries](https://github.com/OWASP/CheatSheetSeries): 140 on 2026-11-25 | a defence any web application is expected to have | never |
| Peer advisories | every advisory the [peers](#peers) published on GitHub: 690 on 2026-11-25 | how an app with the same feature was broken | never |
| Dependency advisories | every advisory against a direct dependency: 362 on 2026-10-28 | how input breaks a library this stack uses | 2026-10-28 |

The dependency list keeps its [classifier rules](./classes.md#classifier-rules): its row is a class and a version minimum. The rest of this file is about the other two.

## One row per item

```
| Item | Verdict | Class | Because |
| --- | --- | --- | --- |
| GraphQL | n/a | | no GraphQL endpoint |
| File_Upload | holds | C6 | `upload-visibility`: an attachment cannot be stored in the public bucket |
| GHSA-xxxx-xxxx-xxxx (outline) | lead | A2 | does a revoked session keep its open relay socket? |
```

- **`n/a`**: the item needs a feature this app does not have. Because names that feature.
- **`holds`**: a class owns the vector and the code refuses it. Because names the test or the line.
- **`lead`**: a class owns the vector and the reader found nothing that refuses it. Because is the question the class's scout settles.

Four rules keep the rows comparable:

- Every item gets a row. Nothing is skipped for its title, its severity or its age: an `n/a` row is the record that the item was read.
- A cheat sheet gets one row per class it touches. A peer advisory gets one row.
- Doubt is a `lead`. A `holds` row without a test or a line is a `lead`.
- A vector no class owns is a `lead` with the class `new`. A person decides whether it joins a class or becomes one.

## How an intake runs

1. **Fetch.** The orchestrator fetches both lists into the gitignored `.scratch/security-intake/`. Readers make no network call.

   ```
   git clone --depth 1 https://github.com/OWASP/CheatSheetSeries .scratch/security-intake/owasp
   gh api "repos/<owner>/<repo>/security-advisories?state=published&per_page=100" --paginate \
     --jq '.[] | {ghsa_id, cve_id, severity, cwe_ids, published_at, summary, description}' \
     > .scratch/security-intake/peers/<repo>.jsonl
   ```

   A later intake takes only what is newer than the list's "Last read" date: the sheets `git log --since=<date> --name-only -- cheatsheets` names, on a clone made with `--shallow-since=<date>`, and the advisories with a later `published_at`.
2. **Read.** One reader ([roles.md](./roles.md#intake-reader)) per batch of 20 sheets or 50 advisories, all launched in one message. A sheet averages 19 kB and an advisory 4 kB, which keeps a batch near 100k tokens. Each writes its rows to `.todos/security-review/intake/<list>-<n>.md`.
3. **Record.** Fill [the record](#the-record) from the rows and set "Last read" in the table above.
4. **Run.** Rank the classes by their `lead` rows and run the top batch ([SKILL.md](./SKILL.md#one-run)). A scout lists its class's `lead` rows under Vectors, and the judge confirms or refutes each like any other lead.

## The record

- **Cheat sheets, in this folder.** Each class in [classes.md](./classes.md) names the sheets it owns on a `Sheets` line, and [Sheets that do not apply](#sheets-that-do-not-apply) names every other sheet with the feature it needs. The two together account for every sheet of the list.
- **Peer advisories, in the ledger.** Their rows stay in the untracked `.todos/security-review/intake/`, because a `lead` row is an open finding. The ledger takes one line per intake with the counts per verdict.
- **A confirmed lead** leaves the same residue as any gap: a fix commit, its test and one sentence in `cella/docs/TESTING.md`.

## Peers

A peer shares a feature with the template, whatever its language: its advisories count for the feature, not for its code. Classes says where a peer's rows are expected; the reader places each row by reading it.

| Peer | Shares | Classes | Advisories on 2026-11-25 |
| --- | --- | --- | ---: |
| better-auth/better-auth | sign-in by mailed link, provider sign-in and account linking, organizations with invitations, an authorization server | A1 to A5, B2 | 49 |
| logto-io/logto | an authorization server, provider connectors, second factors | A3, A4, A5 | 24 |
| nextauthjs/next-auth | provider sign-in, sign-in by mailed link | A1, A4 | 15 |
| supabase/auth | sign-in by mailed link, provider sign-in, second factors | A1, A3, A4 | 4 |
| zitadel/zitadel | an authorization server with tenants | A4, A5, B2 | 87 |
| goauthentik/authentik | an authorization server, provider sign-in | A4, A5 | 47 |
| keycloak/keycloak | the reference authorization server | A4, A5 | 84 |
| outline/outline | workspaces with roles, documents over a relay, API keys, uploads | A5, B1, B2, B5, C6 | 62 |
| makeplane/plane | workspaces, projects and roles | B1, B2, B3 | 112 |
| directus/directus | roles and field access over a database, files | B1, B3, C3, C6 | 83 |
| payloadcms/payload | access rules per collection and field, uploads | B1, B3, C6 | 56 |
| twentyhq/twenty | workspaces with roles over Postgres | B1, B2 | 15 |
| calcom/cal.com | organizations, teams and invitations | B1, B2, D3 | 6 |
| ueberdosis/hocuspocus | a Yjs relay | B5 | 2 |
| toeverything/AFFiNE | collaborative documents in workspaces | B1, B5 | 2 |
| electric-sql/electric | a sync engine over Postgres logical replication | B4, E2 | 3 |
| modelcontextprotocol/typescript-sdk | the MCP server library | B6 | 10 |
| modelcontextprotocol/servers | MCP servers | B6 | 29 |

A peer joins the list when the template gains a feature no peer shares. A peer leaves when two intakes in a row gave it only `n/a` rows.

## An app

An app runs the same intake over two things: the rows of [Sheets that do not apply](#sheets-that-do-not-apply) whose missing feature the app has, and the advisories of peers that share a feature of its own, such as payments or webhooks. Its extra peers and its rows live in its own ledger.

## Sheets that do not apply

No intake has run. The first one fills this table.

| Sheet | Needs |
| --- | --- |
