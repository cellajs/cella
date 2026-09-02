// App barrel seam (pinned; apps own it): re-exported from `shared/index.ts`, so app-owned config
// under `shared/config/*` (which has no subpath export) reaches consumers through the `shared`
// import without editing the synced barrel. Cella exports nothing here.
export {};
