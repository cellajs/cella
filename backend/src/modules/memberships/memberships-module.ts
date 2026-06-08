import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'memberships',
  owner: 'cella',
  scope: 'both',
  description: `Endpoints for managing *memberships*, which represent one-to-one relationships between a
    \`user\` and a contextual \`entity\` (e.g., an \`organization\`). Each membership includes role information
    and status flags such as \`archived\` or \`muted\`. Memberships can also reference parent entities,
    enabling hierarchical context.`,
});
