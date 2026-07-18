# Comment density cleanup

This migration removes detached long-form source comments. Cross-file architecture, operational
workflows, and failure-mode narratives belong in a canonical README. Source comments retain only
the local requirement needed to modify the adjacent declaration or executable block safely.

Run the placement check after pulling the upstream sweep:

```sh
pnpm comments:placement
pnpm comments:placement -- frontend/src
```

The check groups adjacent `//` lines and counts non-empty prose after removing comment delimiters.
It reports blocks longer than three prose lines when they are detached from a TypeScript or
JavaScript declaration. It also reviews long JSONC, CSS, and SCSS blocks. Generated files,
database migrations, localization, and required legal headers remain excluded.

Review each result semantically:

1. Delete prose that repeats code, test names, or existing documentation.
2. Move symbol-specific contracts directly above the function, constant, class, type, or
   interface they govern.
3. Compress an executable-block correctness requirement to at most three prose lines.
4. Move shared architecture or operator guidance to the nearest existing README and keep a short
   source link only when discovery would otherwise be difficult.
5. Create a README only when several files share one coherent subsystem and no canonical document
   exists.

Do not shorten required license or attribution text. Do not move implementation details into a
README merely to satisfy the line limit. A detail used to change one symbol safely stays with that
symbol.

Finish with the repository gates:

```sh
pnpm comments:check
pnpm comments:audit
pnpm comments:placement
pnpm lint
pnpm ts
```
