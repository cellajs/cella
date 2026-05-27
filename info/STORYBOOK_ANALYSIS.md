# Storybook component analysis

Analysis of `frontend/src/modules/common/` components for Storybook story applicability. Goal: identify the top 50% most relevant UI components to create stories for.

## Existing stories

4 stories already exist in `common/stories/`:
- `data-grid.stories.tsx`
- `scroll-spy.stories.tsx`
- `select-emails.stories.tsx`
- `success-checkmark.stories.tsx`

## Classification criteria

- **UI component**: Renders visual elements, has props for customization, can be demonstrated in isolation
- **Wrapper/Container/Utility**: Routing, state management, layout shells, context providers, dev tools — not suitable for Storybook

## Full component inventory

### Root-level files

| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `animated-arrow.tsx` | UI | Medium | SVG arrow with animation, no props |
| `app-router.tsx` | Wrapper | None | Router provider |
| `aside-anchor.tsx` | Utility | None | Scroll anchor point |
| `close-button.tsx` | UI | **High** | Reusable close button with size variants |
| `content-placeholder.tsx` | UI | **High** | Empty state with icon and text |
| `country-flag.tsx` | UI | Medium | Flag image by country code |
| `debug-dropdown.tsx` | Utility | None | Dev-only debug tools |
| `delete-form.tsx` | UI | Medium | Delete confirmation form actions |
| `drop-indicator.tsx` | UI | **High** | DnD drop target visual indicator |
| `entity-avatar.tsx` | UI | **High** | Avatar with fallback/icon/image states |
| `error-notice.tsx` | Wrapper | None | Error boundary layout |
| `expandable-list.tsx` | UI | **High** | Animated expand/collapse list |
| `focus-trap.tsx` | Utility | None | A11y keyboard trap |
| `focus-view.tsx` | UI | Low | Depends on store and nav context |
| `gleap-support.tsx` | Utility | None | External widget integration |
| `hamburger.tsx` | UI | **High** | Animated hamburger menu button |
| `help-text.tsx` | UI | **High** | Help icon with popover |
| `logo.tsx` | UI | **High** | SVG logo with color variants |
| `popconfirm.tsx` | UI | Medium | Confirmation popup |
| `public-layout.tsx` | Wrapper | None | Public routes layout shell |
| `pull-to-refresh.tsx` | Utility | None | Mobile gesture handler |
| `reload-prompt.tsx` | Utility | None | PWA reload prompt |
| `root.tsx` | Wrapper | None | Root layout provider |
| `router-wrapper.tsx` | Wrapper | None | Router wrapper |
| `scroll-reset.tsx` | Utility | None | Scroll positioning provider |
| `search-spinner.tsx` | UI | **High** | Search state spinner/icon toggle |
| `sheet-tabs.tsx` | UI | Medium | Tab navigation for sheets |
| `simple-header.tsx` | UI | **High** | Page header with heading and collapse animation |
| `spinner.tsx` | UI | **High** | Loading spinner with delayed appearance |
| `sticky-box.tsx` | Utility | Low | Sticky positioning wrapper |
| `success-checkmark.tsx` | UI | **High** | Animated success indicator (story exists) |
| `text-effect.tsx` | UI | **High** | Animated text reveal with character stagger |
| `themer.tsx` | Utility | None | Theme application service |
| `tooltip-button.tsx` | UI | **High** | Button with tooltip, positioning options |
| `unsaved-badge.tsx` | UI | Medium | Unsaved changes indicator |

### Subfolder components

#### alerter/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `alert-banner.tsx` | UI | **High** | Animated alert banner with variants, icons, dismiss |
| `down-alert.tsx` | UI | Medium | Offline/down state alert |
| `alerter.tsx` | Wrapper | None | Renders alerts from store |
| `alert-store.ts` | Store | None | — |

#### app/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `app-footer.tsx` | UI | **High** | Footer with links and contact button |
| `app-layout.tsx` | Wrapper | None | Main app shell |
| `app-content.tsx` | Wrapper | None | Content area wrapper |

#### bg-animation/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `bg-animation.tsx` | UI | Low | Fixed background effect, minimal props |

#### blocknote/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `block-note-editor.tsx` | UI | Medium | Rich text editor, complex integration |
| Custom elements/menus | UI | Low | Editor-specific extensions |
| `yjs-*.tsx` | Utility | None | Collaboration infrastructure |

#### board/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `board-panel.tsx` | UI | **High** | Panel header/body with selection states |
| `board-layout.tsx` | UI | Medium | Kanban board layout |
| `board-drag.ts` / `board-store.ts` | Utility | None | — |

#### contact-form/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `contact-form.tsx` | UI | **High** | Form with validation |
| `contact-form-map.tsx` | UI | Low | Map embed, config-dependent |
| `contact-form-handler.tsx` | Utility | None | — |

#### data-grid/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `data-grid.tsx` | UI | Medium | Spreadsheet grid (story exists) |
| Sub-components (cell, row, header) | UI | Low | Grid-internal, not standalone |

#### data-table/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `data-table.tsx` | UI | Medium | Table wrapper with infinite loading |
| Sub-components | UI | Low | Table-internal |

#### dialoger/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `dialog.tsx` | UI | **High** | Dialog/drawer with responsive behavior |
| `drawer.tsx` | UI | Medium | Drawer rendering |
| Provider/hooks | Utility | None | — |

#### dropdowner/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `dropdown.tsx` | UI | **High** | Dropdown menu component |
| `dropdown-action-item.tsx` | UI | Medium | Menu item variant |
| Provider/hooks | Utility | None | — |

#### form-fields/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `input.tsx` | UI | **High** | Generic text/textarea input field |
| `avatar.tsx` | UI | **High** | Avatar upload form field |
| `select-role.tsx` | UI | **High** | Role selection dropdown |
| `select-roles.tsx` | UI | **High** | Multi-role checkbox group |
| `select-role-radio.tsx` | UI | **High** | Radio group for role selection |
| `select-language.tsx` | UI | **High** | Language select dropdown |
| `select-languages.tsx` | UI | **High** | Multi-language selector |
| `select-emails.tsx` | UI | **High** | Email tag input (story exists) |
| `select-sort.tsx` | UI | **High** | Sort dropdown with icons |
| `slug.tsx` | UI | Medium | URL slug with validation |
| `domains.tsx` | UI | Medium | Domain list input |
| `blocknote.tsx` | UI | Medium | Editor form field wrapper |
| `select-combobox/` | UI | Medium | Async combobox selectors |

#### page/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `header.tsx` | UI | **High** | Page header with avatar, title, breadcrumb |
| `aside.tsx` | UI | **High** | Sidebar nav with scroll-spy |
| `cover.tsx` | UI | **High** | Cover image with upload |
| `tab-nav.tsx` | UI | **High** | Tab navigation |

#### resizable-panels/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `resizable-panels.tsx` | UI | Medium | Resizable panel layout |

#### sheeter/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `sheet.tsx` | UI | Medium | Sheet/drawer component |
| Provider/hooks | Utility | None | — |

#### stepper/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `stepper.tsx` | UI | **High** | Step indicator with variants (circle, line) |
| `step.tsx` | UI | **High** | Individual step component |
| `horizontal-step.tsx` | UI | High | Horizontal orientation |
| `vertical-step.tsx` | UI | High | Vertical orientation |
| `step-icon.tsx` | UI | High | Step states (active, completed, error) |
| `step-label.tsx` | UI | Medium | Step label |
| Context/hooks | Utility | None | — |

#### toaster/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `toaster.ts` | UI | **High** | Toast notification API |
| `toaster-provider.tsx` | Wrapper | None | Sonner provider |

#### uploader/
| Component | Type | Relevance | Notes |
|-----------|------|-----------|-------|
| `uploader.tsx` | Utility | Low | Uppy integration, hard to isolate |
| Hooks/helpers | Utility | None | — |

#### form-draft/ / devtools/
All utility/wrapper — None relevant.

---

## Top 50% selection

The following **35 components** (grouped logically) are the top 50% most relevant for Storybook stories. Ordered by priority within each category.

### Tier 1 — Essential standalone UI (create stories first)

| # | Component | Why |
|---|-----------|-----|
| 1 | `spinner.tsx` | Universal loading indicator, delayed appearance variant |
| 2 | `close-button.tsx` | Reusable, size variants |
| 3 | `entity-avatar.tsx` | Multiple states: fallback, icon, image, sizes |
| 4 | `logo.tsx` | Branding, color variants, icon-only mode |
| 5 | `tooltip-button.tsx` | Button + tooltip composition, positioning |
| 6 | `hamburger.tsx` | Animated state transitions |
| 7 | `search-spinner.tsx` | Spinner ↔ icon toggle animation |
| 8 | `help-text.tsx` | Popover/text variants |
| 9 | `content-placeholder.tsx` | Empty states with icon and text |
| 10 | `simple-header.tsx` | Page heading with scroll collapse |
| 11 | `text-effect.tsx` | Character-level stagger animation |
| 12 | `expandable-list.tsx` | Animated expand/collapse |
| 13 | `drop-indicator.tsx` | DnD edge positioning variants |
| 14 | `success-checkmark.tsx` | Animated checkmark (story exists — extend) |
| 15 | `unsaved-badge.tsx` | Indicator badge |
| 16 | `alert-banner.tsx` | Alert variants, icons, dismiss behavior |

### Tier 2 — Form fields (high reuse, good for documenting API)

| # | Component | Why |
|---|-----------|-----|
| 17 | `form-fields/input.tsx` | Core input, text/textarea/icon variants |
| 18 | `form-fields/avatar.tsx` | Avatar upload field |
| 19 | `form-fields/select-role.tsx` | Single role selection |
| 20 | `form-fields/select-roles.tsx` | Multi-role checkboxes |
| 21 | `form-fields/select-role-radio.tsx` | Radio role selection |
| 22 | `form-fields/select-language.tsx` | Language dropdown |
| 23 | `form-fields/select-languages.tsx` | Multi-language selector |
| 24 | `form-fields/select-emails.tsx` | Email tag input (story exists — extend) |
| 25 | `form-fields/select-sort.tsx` | Sort dropdown with icons |

### Tier 3 — Composite patterns (valuable for documenting composition)

| # | Component | Why |
|---|-----------|-----|
| 26 | `stepper/stepper.tsx` | Step indicator with circle/line variants, orientations |
| 27 | `page/header.tsx` | Page header with avatar, title, breadcrumb |
| 28 | `page/aside.tsx` | Sidebar with scroll-spy tabs |
| 29 | `page/cover.tsx` | Cover image with upload |
| 30 | `page/tab-nav.tsx` | Tab navigation |
| 31 | `dialoger/dialog.tsx` | Modal/drawer responsive behavior |
| 32 | `dropdowner/dropdown.tsx` | Dropdown menu |
| 33 | `board/board-panel.tsx` | Panel with selection/highlight states |
| 34 | `app/app-footer.tsx` | Footer composition |
| 35 | `toaster/toaster.ts` | Toast notification API demo |

### Excluded (bottom 50%)

Components excluded as wrapper/container/utility or low Storybook value:
- All router, layout shell, and provider components (`app-router`, `root`, `public-layout`, `app-layout`, `app-content`, `router-wrapper`)
- All stores and hooks-only files
- Context providers (`themer`, `scroll-reset`, `focus-trap`, `sheeter/provider`, etc.)
- Dev tools (`debug-dropdown`, `devtools/`)
- External integrations (`gleap-support`, `uploader/`)
- PWA/mobile utilities (`reload-prompt`, `pull-to-refresh`)
- Editor internals (`blocknote/` custom menus/elements, `yjs-*`)
- Grid/table sub-components that aren't standalone
- `form-draft/` (hook-only)
- `bg-animation` (minimal props, fixed visual)
- `error-notice` (requires boundary context)
- `aside-anchor`, `sticky-box` (structural, no visual output)
