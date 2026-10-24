---
syncBreaking: true
clientCacheBump: false
---

# Docs links hold no inline code

`pnpm style` fails on a Markdown or MDX link whose label holds inline code, such as ``[`define.ts`](./define.ts)``.
Drop the backticks and keep the link: `[define.ts](./define.ts)`. Fenced code, double-backtick examples, image alt
text and changelogs are not checked.

## What & why

The new `code-in-link` rule in `shared/scripts/check-doc-style.ts` reads every authored `.md` and `.mdx` file. The docs
draw inline code as a bordered chip, and inside a link that chip hides the underline that marks the text as a link.

## Blast radius

Sync-breaking for apps whose own Markdown links a code label: `pnpm style`, and with it `pnpm check` and CI, fails
until those labels lose their backticks. No database, cache or runtime change.

## Run

No script. This one-liner strips the backticks from labels that are code from end to end:

```sh
perl -pi -e 's/(?<!!)\[`([^`\[\]]+)`\](?=[(\[])/[$1]/g' $(git ls-files '*.md' '*.mdx' ':!:*CHANGELOG.md')
```

## Manual steps

1. Review the diff: the one-liner also rewrites links in fenced examples, which the rule leaves alone.
2. Rewrite the labels `pnpm style` still lists by hand, such as ``[`migrate` skill]`` to `[migrate skill]`.

## Verify

```sh
pnpm style
pnpm check
```
