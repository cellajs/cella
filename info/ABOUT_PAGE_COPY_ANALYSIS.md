# About page copy analysis

A review of every text on the marketing **About** page ([about-page.tsx](../frontend/src/modules/marketing/about/about-page.tsx), strings in [locales/en/about.json](../locales/en/about.json)) against the landing-page framework from [julian.com/guide/startup/landing-pages](https://www.julian.com/guide/startup/landing-pages).

## Framing used for this analysis

- **Audience:** web developers.
- **Problem:** there is no good way to add a sync engine to *some* features of an app without it taking over *all* of them. Existing sync solutions are all-or-nothing — they replace your API, lock you into a framework/database, or introduce a second, conflicting data flow.
- **Solution:** a sync engine that *complements* an existing REST API and its patterns, so you opt into sync per feature.

Julian's core formula: `Purchase Rate = Desire − (Labor + Confusion)`.
- Increase **desire** — show specific value, make a bold/credible claim.
- Decrease **labor** — be concise; every word earns its place.
- Decrease **confusion** — the header alone must tell a developer exactly what this is.

The litmus test for the hero: *if a developer reads only the header + subheader, do they know exactly what Cella is and why they'd want it?*

---

## Section-by-section findings

### 1. Hero — highest priority

Current copy:
- Title: `""` (empty — `hero.title` is blank, only the `about:prerelease` badge shows)
- Subtitle (`hero.subtitle`): "A sync engine that enhances your API."
- Text (`hero.text`): "Cella is a TypeScript template to build web apps with offline & realtime capabilities. MIT licensed. European infra."
- Primary CTA: the `pnpm create @cellajs/cella` copy field.

**Problems**
- **No header.** This is the single biggest issue. Julian: nailing the header has the highest impact on whether people keep reading. Right now the first real sentence is a subheader doing a header's job.
- **"enhances your API" is vague.** It hints at the differentiator (complement, not replace) but doesn't land the core insight: *you don't sync everything.* The unique problem — partial/opt-in sync — is invisible above the fold.
- **Mixed message.** The subtitle pitches a *sync engine*; the text pitches a *TypeScript template*. A visitor can't tell if this is a library, a framework, or a boilerplate. That's confusion (Julian's #1 bounce driver).
- **Credibility chips buried.** "MIT licensed. European infra." are good trust signals but compete with the core pitch in the same sentence.

**Options (pick one direction, A is recommended)**

Option A — lead with the problem/solution, the differentiator first:
- Header: **"Add a sync engine to the features that need it — not your whole app."**
- Subheader: "Cella is an open-source TypeScript template where sync, offline and realtime *complement* your REST API instead of replacing it. Opt in per feature."

Option B — bold claim + objection handling:
- Header: **"Offline and realtime, without rewriting your REST API."**
- Subheader: "Most sync engines force an all-or-nothing rewrite. Cella layers notify-then-fetch sync on top of the API patterns you already use — feature by feature."

Option C — descriptive/literal (safest, very clear):
- Header: **"A TypeScript template for apps that are partly realtime, partly REST."**
- Subheader: "Start every feature as plain REST, then opt into offline and realtime sync only where it pays off."

Keep "MIT licensed · European infra · prerelease" as a small chip row *below* the subheader, not inside it.

---

### 1b. Hero — "boring", "opt-in per feature" and the raak 80% angle

Two strong instincts to build on:
- **"Cella makes building web apps with sync boring."** This works because it leans on the developer-famous *"choose boring technology"* trope — boring = predictable, reliable, no surprises. It's a bold claim that triggers "wait, how?" and pulls the reader down the page. The risk: "boring" can read as "unexciting/low-value" to a non-developer or a skim-reader. Mitigate by pairing it with a subheader that immediately reframes *boring* as *predictable/no-rewrite*.
- **"Sync is opt-in, per feature."** This is the single clearest expression of the differentiator. It's concrete, short, and impossible to misread. Strong candidate for either the header's second line or the subheader.
- **The raak 80%-reuse angle** is real social proof / a credibility hook: "We build raak.dev on Cella and reuse ~80% of the code." It proves the template is production-grade and that *you* (the visitor) would get the same leverage. Per Julian, a bold claim works best when it's specific and verifiable — "80%" is exactly that.

**Hero option D — "boring" as the bold claim (recommended pairing)**
- Header: **"Cella makes building web apps with sync boring."**
- Subheader: "Boring as in predictable: sync, offline and realtime *complement* your REST API instead of replacing it — and it's opt-in, per feature."
- Chip row: `MIT licensed · European infra · prerelease`

**Hero option E — "boring" + the 80% proof in the subheader**
- Header: **"Cella makes building web apps with sync boring."**
- Subheader: "An open-source TypeScript template where sync is opt-in per feature. We build raak.dev on it and reuse ~80% of the code."

**Hero option F — lead with opt-in, "boring" as the hook line below**
- Header: **"Sync is opt-in, per feature."**
- Subheader: "Cella is a TypeScript template that makes building offline & realtime web apps boring — predictable, no rewrite, complements your REST API."

**Hero option G — the 80% reuse as the headline claim**
- Header: **"We reuse 80% of Cella to build raak.dev."**
- Subheader: "A TypeScript template with opt-in, per-feature sync — so offline and realtime complement your REST API instead of replacing it."
- Note: this one leads with proof/desire but hides *what Cella is* until the subheader; only use if the raak story is the strongest selling point for your audience.

**How to combine the three ideas**
The cleanest structure keeps each idea in its designated slot (Julian's hierarchy):
- **Header = the bold claim** → "Cella makes building web apps with sync boring."
- **Subheader = the mechanism that makes the claim believable** → "opt-in, per feature… complements your REST API."
- **Social proof row (just under the hero) = the 80% raak stat** → "Built with Cella: raak.dev reuses ~80% of the template."

That way "boring" hooks, "opt-in per feature" de-risks/clarifies, and "80%" proves — without crowding the header. Reusing the raak stat here also strengthens the Showcase section (§7), which currently lacks quantitative proof.

**Watch-outs for "boring"**
- Always immediately define what *boring* means (predictable / no rewrite / no surprises) in the very next line, or skim-readers may misfile it as "unremarkable."
- Keep it as the header only if the subheader carries the concrete value. "Boring" alone fails Julian's litmus test (a visitor reading only the header wouldn't know what Cella *is*) — the subheader must close that gap.

---

### 2. "Why we built Cella" (`title_2` / `text_2` / `sync_flow`)

Current:
- Title: "Why we built Cella"
- Text (`text_2`): "Not every feature needs synced data. Therefore, a sync engine shouldn't replace your API or introduce conflicting data flows. It should complement it."
- `sync_flow`: "Cella is based on the notify-then-fetch pattern: a Change Data Capture worker receives Postgres changes and sends updates to API by WebSocket → API sends an SSE to notify client → (React Query) client then fetches (cached) data."

**Assessment:** `text_2` is the **strongest, most on-message copy on the page** — it states the exact problem and solution. It's currently the *second* section; it (or its idea) belongs in the hero.

**Problems**
- The section title "Why we built Cella" is founder-centric, not visitor-centric. Julian: talk in terms of benefit to the reader, not self-narrative.
- `sync_flow` is dense and uses internal jargon (CDC worker, WebSocket, SSE, React Query) in one run-on sentence. Good as a *detail-on-demand* element, heavy as body copy.

**Options**
- Retitle to a value-prop header: **"Sync that complements your API, not replaces it"** or **"Not every feature needs to sync"**.
- Promote `text_2`'s phrasing into the hero subheader; keep a shorter version here.
- Keep `sync_flow` but pair it tightly with the `SyncDiagram` and consider shortening to one line, with the step-by-step revealed on hover/expand (Julian's "reveal details to keep users in flow").

---

### 3. "Why a template" (`how_it_works` / `how_it_works.text`)

Current:
- Title: "Why a template"
- Text: "We believe it's the only way to balance usability, simplicity & ownership. A sync framework or database locks you in. A library is either too limited or too brittle."

**Assessment:** This is excellent **objection handling** — it answers "why not a library or a framework?" Per Julian, that's exactly the kind of buying objection a developer has.

**Problems**
- "We believe it's the only way…" is a soft opener. Lead with the objection itself.
- The three-way contrast (framework/database vs library vs template) is good but compressed.

**Options**
- Reframe as a feature header + objection paragraph:
  - Header: **"Why a template instead of a library or framework"**
  - Paragraph: "A sync framework or database locks you in. A library is too limited or too brittle. A template you own gives you the sync engine *and* the freedom to change it." 
- The `compare_intro` + `compare_alternatives` ("View comparisons" vs Electric, Zero, PowerSync…) is strong differentiation material — make sure that comparison page actually exists and the button is prominent, since competitor comparison is high-intent content for this audience.

---

### 4. "Fundamental features" / Why grid (`benefits`, `why.*`)

Current:
- Section title (`benefits`): "Fundamental features"
- `why.title_1` "Full ownership, no lock-in" / `why.text_1` "Postgres, OpenAPI & React Query are core primitives for all data flows. No abstraction layers."
- `why.title_2` "Ready-to-use APIs" / `why.text_2` "Authentication, organizations, users. An entity hierarchy model with permission manager. And much more."
- `why.title_3` "Deploy on European infra" / `why.text_3` "Building secure, compliant and scalable web apps on European infra is still hard. Cella makes it easier."

**Assessment:** Solid feature headers — concrete and benefit-oriented (Julian wants blunt value props, not "Empower your workflow"). These three are good.

**Problems**
- Section title "Fundamental features" is generic. 
- None of the three "Why" cards ties back to the dominant value prop (opt-in/partial sync). Julian: every feature should carry a running narrative back to the hero claim. Sync is the differentiator but doesn't headline any of the three cards here.
- "And much more." is filler — delete or replace with a specific.

**Options**
- Rename section to something tied to the pitch, e.g. **"Built on primitives you already know"** (reinforces "complements your API").
- Consider making one of the three cards explicitly about **opt-in sync** so the hero promise is restated here.
- Replace "And much more." with a concrete (e.g. "…plus invitations and configurable roles.").

---

### 5. Stack ("We love this stack", `title_3` / `text_3` + `stack.*`)

Current:
- Title: "We love this stack"
- Text: "Best-in-class TypeScript libraries. And they play nice together."
- Cards: postgres/drizzle, hono, openapi-ts, react/tanstack, base-ui, vite/pnpm, yjs, pulumi, artillery.

**Assessment:** For a developer audience this is genuinely persuasive — the stack *is* social proof. Concrete and well-scoped.

**Problems**
- "We love this stack" is founder-voice again. The benefit to the developer is "no exotic dependencies / familiar tools."
- "And they play nice together." is weak filler.

**Options**
- Retitle toward the reader: **"A stack you already trust"** or **"No exotic dependencies"**.
- Tie back to the narrative: "Familiar, best-in-class TypeScript libraries — so the sync engine sits on tools you already know, not a black box."

---

### 6. Integrations (`title_4` / `text_4` + `cards.*`)

Current:
- Title: "Integrations"
- Text: "Powerful integrations to reduce time-to-market."

**Assessment:** Fine and clear. "Reduce time-to-market" is a real benefit. Low priority.

**Options**
- Minor: the card descriptions are consistent; "Track event effortlessly" (onedollarstats) has a typo — should be "Track events effortlessly."

---

### 7. Showcase (`showcase` / `showcase.text`)

Current:
- Title: "Showcase"
- Text: "Don't just take our word for it — 🧐 explore what we're building with Cella."
- `showcase.title_1` "raak.dev" / "An issue tracker to manage multiple app projects from a single page view. Built for speed & fun."

**Assessment:** This is the closest thing to **social proof** on the page (Julian's row 3). Good to have a real product (raak.dev) demonstrating the template.

**Problems**
- One showcase item reads as light social proof. If there are real users/forks/stars, surface numbers here (GitHub stars, "built with Cella" count).
- The emoji in body copy is informal; fine if it matches brand voice, risky for a credibility section.

**Options**
- Add GitHub stars / fork count / "N apps built with Cella" if available — quantitative proof is stronger than a single example.
- Consider moving a slim version of this proof *higher* (near the hero), per Julian's structure where social proof sits right under the hero.

---

### 8. Call to action (`call_to_action.*`)

Current:
- Intro: "Open source / Europe-first"
- Start: "Sovereignty is increasingly important. Cella wants to partner with cloud & service providers that are open source and/or European."
- Finish: " Want to join?"

**Problems**
- This CTA is about **partnering with providers**, not about the developer **trying the product**. Julian: the CTA must be the natural next step that fulfills the hero's claim. The hero says "build apps with offline & realtime"; the closing CTA should be "start building," not "partner with us."
- "Want to join?" is vague — join what?

**Options**
- Make the primary closing CTA mirror the hero action: **"Start your app"** → repeat the `pnpm create @cellajs/cella` command + a "Get started on GitHub" button (you already have `start_github.text`).
- Keep the open-source/European-partner message as a *secondary* CTA lower down, not the final ask.

---

## Cross-cutting recommendations

1. **Fix the hero header first.** Everything else is secondary. A developer must learn "opt-in sync that complements your REST API" in the first sentence. The best phrasing for this already exists in `text_2` — promote it.
2. **Pick one identity:** sync engine *or* template — then state the other as the mechanism. Suggested framing: "A TypeScript template whose sync engine complements (not replaces) your REST API."
3. **Lead the differentiator everywhere:** the *opt-in, per-feature, complement-not-replace* idea is the unique, defensible hook. It appears in `text_2` and the `product_entities` feature ("progressively, never all-or-nothing") but is missing from the hero, the benefits grid, and the CTA. Thread it through all of them (Julian's "running narrative").
4. **Convert founder-voice titles to reader-value titles:** "Why we built Cella", "Why a template", "We love this stack" → benefit-led headers.
5. **Realign the final CTA** with the hero action (try it / GitHub), and demote the partner pitch to secondary.
6. **Add quantitative social proof** (stars, forks, apps built) if it exists.
7. **Tighten filler:** remove "And much more.", "And they play nice together."; fix "Track event" → "Track events".

## Priority order

| Priority | Change | Why |
|---|---|---|
| P0 | Write a real hero header stating opt-in sync + REST complement | Highest conversion impact; currently empty |
| P0 | Resolve sync-engine-vs-template ambiguity in hero | Removes the #1 source of confusion |
| P1 | Thread "complement, not replace / opt-in per feature" through benefits + CTA | Running narrative; reinforces the unique hook |
| P1 | Repoint the final CTA to "start building / GitHub" | CTA must fulfill the hero's claim |
| P2 | Reader-value section titles, social-proof numbers | Desire + credibility |
| P3 | Copy cleanups (filler, typo, emoji) | Polish |
