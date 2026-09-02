# Emails

Transactional email templates, authored as React components and rendered to static HTML on the server. There is **no runtime dependency on [`jsx-email`](https://jsx.email/)**: a small subset of jsx-email v3.2.1 (MIT) is vendored under [renderer/](renderer/) and [components/primitives/](components/primitives/).

## Authoring a template

A template is a `defineEmailTemplate()` definition with two parts:

- `translate(lng, statics)`: pure function returning every translated string (plus any pass-through statics the component needs). Must include `subject`.
- `component(props)`: a dumb React shell built from `components/` and `components/primitives/`. No i18n calls.

`defineEmailTemplate` types `component()` to exactly what `translate()` returns (plus per-recipient placeholder strings), so the two cannot drift. Each definition carries a `preview: { statics, recipient }` field with sample data, type-checked against its own props. Export the template from [index.ts](index.ts) and register its preview slug in [preview-fixtures.ts](preview-fixtures.ts).

## Rendering

`render()` in [renderer/render.ts](renderer/render.ts) turns a React element into email-ready HTML (XHTML doctype, rehype style hoisting, raw-HTML and MSO conditional handling). Node-only and async. The `plainText` render option gives plain-text output.

`RenderOptions` keeps the full jsx-email option surface for API parity, but only `plainText` is acted on; `disableDefaultStyle`, `inlineCss`, `minify` and `pretty` are inert. Each component's own `disableDefaultStyle` prop controls its default styling.

## Previewing

`preview-fixtures.ts` maps each preview slug (used in URLs and Storybook story names) to its template; the sample props live on the template's `preview` field and are shared by previews and tests.

- **Storybook**: the _Emails / Email templates_ stories fetch rendered HTML from the backend into an iframe, with language and placeholder controls.
- **Dev route**: with the backend running (`pnpm dev`), `http://localhost:4000/dev/emails` lists templates and `/dev/emails/:name?lng=&placeholders=1` renders one. Mounted only outside production.

`tests/emails/email-templates.test.ts` renders every fixture in every language.
