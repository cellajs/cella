# Comment reasoning cleanup

This migration removes source comments that preserve rejected approaches, change history, or unresolved review discussion. Useful comments are rewritten around the current behavior, invariant, or constraint.

The repository check covers hand-authored TypeScript, JavaScript, CSS, SQL, YAML, JSONC, Dockerfile, and Caddyfile comments. It excludes generated output, database migrations, localization, and Markdown history.

Run the required check after pulling the upstream sweep:

```sh
pnpm comments:check
```

Audit fork-specific code for lower-confidence compatibility, debt, and jargon markers:

```sh
pnpm comments:audit
pnpm comments:audit -- frontend/src
```

Review every audit result manually. Compatibility language may describe a current wire or storage contract. Temporary language should identify an active constraint or tracked follow-up. The Yjs operation named `materialize` remains valid; ordinary comments should name the concrete action.

Do not apply a punctuation replacement across the tree. Split sentences, remove secondary clauses, and delete comments that only narrate obvious code. Finish with the repository gates:

```sh
pnpm comments:check
pnpm lint
pnpm ts
```
