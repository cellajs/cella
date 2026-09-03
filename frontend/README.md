# frontend

React SPA on Vite: TanStack Router for routing, Zustand for state, TanStack Query for data fetching. Runs as part of `pnpm dev`.

## Source style

Declare named React components with functions. Wrappers use a named function expression:

```tsx
export function ProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
}

export const MemoizedProjectTile = memo(function MemoizedProjectTile(props: ProjectTileProps) {
  return <article>{props.name}</article>;
});
```

Never annotate component declarations with `React.FC` or `FC`. Use `ComponentType<Props>` when a component is passed or stored as a value.

Give every exported function and constant a one- or two-sentence JSDoc description.

Local comments explain non-obvious constraints or reasoning, never assignments, branches, render structure, or repeated operations. One comment above a repetitive block covers its shared constraint.
