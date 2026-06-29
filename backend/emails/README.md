# Emails

Transactional email templates, authored as React components and rendered to
static HTML on the server. This module has **no runtime dependency on the
[`jsx-email`](https://jsx.email/) package** — a small, behavior-preserving subset
of jsx-email v3.2.1 (MIT) is vendored under [renderer/](renderer/) and
[components/primitives/](components/primitives/), so we own and lint it as
first-party code.

## Layout

```
emails/
  index.ts             Barrel exporting every template (the *Email defs)
  types.ts             EmailRecipient, EmailTemplateDef, defineEmailTemplate()
  i18n.ts              Email-scoped i18next instance
  styles.ts            Shared style tokens
  templates/           One file per email (account-security, member-invite, …)
  components/           Reusable, app-styled building blocks (Email* + SafeHtml)
    primitives/         Vendored jsx-email primitives (Body, Button, Container, …)
  renderer/             Vendored jsx-email render pipeline (JSX → HTML string)
  preview-fixtures.ts  Maps preview slugs to templates (sample data lives on each template's `preview`)
  render-preview.ts    renderEmailPreview(name, { lng, placeholders })
  preview-route.ts     Dev-only Hono app mounted at /dev/emails
```

## Authoring a template

A template is a `defineEmailTemplate()` definition with two parts:

- `translate(lng, statics)` — pure function that returns every translated string
  (and any pass-through statics the component needs). Must include `subject`.
- `component(props)` — a dumb React shell built from `components/` and
  `components/primitives/`. No i18n calls here.

`defineEmailTemplate` enforces that `component()` receives exactly what
`translate()` returns (plus per-recipient placeholder strings), so the two can't
drift. Each definition also carries a `preview: { statics, recipient }` field
with sample data, type-checked against the template's own props. Export the new
template from [index.ts](index.ts) and register its preview slug in
[preview-fixtures.ts](preview-fixtures.ts).

## Rendering

`render()` from [renderer/render.ts](renderer/render.ts) turns a React element
into an email-ready HTML string (XHTML doctype, rehype style hoisting, raw-HTML
and MSO conditional handling). It is Node-only and async. Plain-text output is
available via the `plainText` render option.

`RenderOptions` keeps the full jsx-email option surface for API parity, but only
`plainText` is acted on. `disableDefaultStyle`, `inlineCss`, `minify` and
`pretty` are inert here — per-component default styling is controlled by each
component's own `disableDefaultStyle` prop.

## Previewing

`preview-fixtures.ts` maps each preview slug (used in URLs and Storybook story
names) to its template; the sample `statics` + `recipient` props live on each
template's `preview` field. This data is shared by previews and tests.

- **Storybook** — the *Emails / Email templates* stories fetch rendered HTML from
  the backend and show it in an iframe, with language and placeholder controls.
- **Dev route** — with the backend running (`pnpm dev`), browse
  `http://localhost:4000/dev/emails` for an index, or
  `/dev/emails/:name?lng=&placeholders=1` for a single template. The route is
  only mounted outside production.

`tests/emails/email-templates.test.ts` renders every fixture in every language to
guard against regressions.

## Vendored from jsx-email (what was dropped)

The vendored subset is intentionally minimal. Compared with upstream jsx-email
v3.2.1 we removed:

- the **plugin system** (auto-discovery + dynamic import of `@jsx-email/plugin-*`)
  and the inline-CSS / minify / pretty plugins;
- on-disk **config discovery** (`jsx-email.config.*`) and the global config cache;
- the **debug** (`data-*` attribute) and branded **logger** machinery;
- the **CLI**, Tailwind support, and esbuild-based types.

What remains is just the render pipeline and the primitives our templates use.
All vendored files carry a provenance note; lint rules that conflict with the
upstream shapes are relaxed for these folders in `biome.jsonc` (formatting and
every other rule still apply).

