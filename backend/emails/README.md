# Emails

Transactional email templates, authored as React components and rendered to static HTML on the server. This module has **no runtime dependency on the [`jsx-email`](https://jsx.email/) package**: a small, behavior-preserving subset of jsx-email v3.2.1 (MIT) is vendored under [renderer/](renderer/) and [components/primitives/](components/primitives/).

## Authoring a template

A template is a `defineEmailTemplate()` definition with two parts:

- `translate(lng, statics)`: pure function that returns every translated string (and any pass-through statics the component needs). Must include `subject`.
- `component(props)`: a dumb React shell built from `components/` and `components/primitives/`. No i18n calls here.

`defineEmailTemplate` enforces that `component()` receives exactly what `translate()` returns (plus per-recipient placeholder strings), so the two can't drift. Each definition also carries a `preview: { statics, recipient }` field with sample data, type-checked against the template's own props. Export the new template from [index.ts](index.ts) and register its preview slug in [preview-fixtures.ts](preview-fixtures.ts).

## Rendering

`render()` from [renderer/render.ts](renderer/render.ts) turns a React element into an email-ready HTML string (XHTML doctype, rehype style hoisting, raw-HTML and MSO conditional handling). It is Node-only and async. Plain-text output is available via the `plainText` render option.

`RenderOptions` keeps the full jsx-email option surface for API parity, but only `plainText` is acted on. `disableDefaultStyle`, `inlineCss`, `minify` and `pretty` are inert here. Per-component default styling is controlled by each component's own `disableDefaultStyle` prop.

## Previewing

`preview-fixtures.ts` maps each preview slug (used in URLs and Storybook story names) to its template; the sample `statics` + `recipient` props live on each template's `preview` field. This data is shared by previews and tests.

- **Storybook**: the _Emails / Email templates_ stories fetch rendered HTML from the backend and show it in an iframe, with language and placeholder controls.
- **Dev route**: with the backend running (`pnpm dev`), browse `http://localhost:4000/dev/emails` for an index, or `/dev/emails/:name?lng=&placeholders=1` for a single template. The route is only mounted outside production.

`tests/emails/email-templates.test.ts` renders every fixture in every language to guard against regressions.
