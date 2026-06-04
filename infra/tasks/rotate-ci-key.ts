/**
 * rotate-ci-key — emit instructions for rotating the CI Scaleway API key
 * after the deploy-tags IAM split (P1.9 #34).
 *
 * Scaleway API keys cannot be auto-rotated via Pulumi without losing the
 * state-bucket credentials mid-run. This task documents the manual flow
 * and emits the commands you can copy/paste. It does not execute them.
 *
 * Usage: tsx infra/tasks/rotate-ci-key.ts <staging|production>
 */
import { pathToFileURL } from 'node:url'

interface Args {
  mode: string
}

export function renderInstructions({ mode }: Args): string {
  return [
    `# Rotate CI Scaleway key for stack "${mode}"`,
    '',
    '# 1. In the Scaleway console, create a NEW IAM application named',
    `#    "ci-${mode}-deploy-tags". Attach only the permission sets that`,
    '#    `infra/tasks/setup-ci-key.ts` whitelists (see permission-sets.test.ts).',
    '',
    '# 2. Generate an API key for the new application. Note its',
    '#    application_id (you will need it for step 4).',
    '',
    '# 3. Update GitHub Actions secrets:',
    `#      gh secret set SCW_ACCESS_KEY --env ${mode} --body '<new access key>'`,
    `#      gh secret set SCW_SECRET_KEY --env ${mode} --body '<new secret key>'`,
    '',
    '# 4. Wire the new application_id into Pulumi so the deploy-tags bucket',
    '#    policy starts allowing PutObject from CI:',
    `#      pulumi config set --stack ${mode} infra:ciApplicationId <application_id>`,
    `#      pulumi up --stack ${mode}    # bucket policy change only — should be a no-op for VMs`,
    '',
    '# 5. Trigger a deploy and confirm roll-services succeeds with the new key.',
    '',
    '# 6. Once green, delete the OLD CI application in the Scaleway console.',
    '#    Wait at least one hour before deletion: any in-flight workflow run',
    '#    that started before the GitHub secret update would still be using it.',
  ].join('\n')
}

export async function main(): Promise<void> {
  const mode = process.argv[2]
  if (!mode) {
    console.error('Usage: rotate-ci-key.ts <staging|production>')
    process.exit(1)
  }
  console.info(renderInstructions({ mode }))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
