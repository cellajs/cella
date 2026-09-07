/** File-based routing options shared by the Vite plugin and `pnpm gen:routes`, so both write the same tree. */
export const routerOptions = {
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: 'src/routes',
  generatedRouteTree: 'src/routes/routeTree.gen.ts',
  // Non-route helper files living in src/routes (router instance, shared utils, types, generated tree)
  routeFileIgnorePattern: '(router\\.ts|route-utils\\.tsx|types\\.ts|routeTree\\.gen\\.ts)$',
} as const;
