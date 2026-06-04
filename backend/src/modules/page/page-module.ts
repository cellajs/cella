import { registerTag } from '#/core/tag-registry';

registerTag({
  tag: 'pages',
  kind: 'module',
  parent: 'cella',
  description: `Endpoints for managing *pages*, which are product entities supporting realtime sync and offline
    capabilities. Pages can be organized hierarchically and are used in /docs.`,
});
