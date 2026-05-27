/**
 * Compute — one Docker Compose VM per backend service (backend, cdc, yjs, ai).
 *
 * Each VM has a fully-closed inbound security group and is reachable only over the
 * main private network from the load balancer and database. Cloud-init installs
 * Docker, logs into the container registry, writes the shared compose.yml + .env,
 * and starts the service-specific compose profile.
 *
 * Replacement model: any change to image tag or userdata triggers a full VM
 * replacement; LB health checks bridge the cutover. CDC uses deleteBeforeReplace
 * because it is a singleton — two replication slots must not run concurrently.
 *
 * Known limitation: Scaleway has no instance-attached IAM identities, so app
 * secrets and the registry-login credential are necessarily embedded in cloud-init
 * userdata. Anyone with `InstancesReadOnly` on the project can read them.
 * Break-glass access is the Scaleway serial console (no SSH listener is opened).
 */
import * as pulumi from '@pulumi/pulumi'
import * as scaleway from '@pulumiverse/scaleway'
import { naming, zone, region, tags, infra, mode, appUrls, domains, hasDomain, infraConfig } from '../helpers'
import { privateNetworkId } from './network'
import { registryEndpoint } from './registry'
import { connectionStringAdmin, connectionStringRuntime, connectionStringCdc } from './database'

// ---------------------------------------------------------------------------
// Secrets from stack config
// ---------------------------------------------------------------------------

const cookieSecret = infraConfig.requireSecret('cookieSecret')
const unsubscribeSecret = infraConfig.requireSecret('unsubscribeSecret')
const cdcSecret = infraConfig.requireSecret('cdcSecret')
const yjsSecret = infraConfig.requireSecret('yjsSecret')
const piiHashSecret = infraConfig.requireSecret('piiHashSecret')
const brevoApiKey = infraConfig.requireSecret('brevoApiKey')
const scwAiApiKey = infraConfig.requireSecret('scwAiApiKey')
const adminEmail = infraConfig.requireSecret('adminEmail')
const scwSecretKey = new pulumi.Config('scaleway').requireSecret('secretKey')
const scwAccessKey = new pulumi.Config('scaleway').requireSecret('accessKey')

// ---------------------------------------------------------------------------
// Security Group — fully closed inbound; LB reaches VMs via private network.
// Break-glass access is via Scaleway's serial console (no SSH on the public
// internet). See infra/README.md → "Emergency access".
// ---------------------------------------------------------------------------

const securityGroup = new scaleway.instance.SecurityGroup('compute-sg', {
  name: naming.resource('compute-sg'),
  inboundDefaultPolicy: 'drop',
  outboundDefaultPolicy: 'accept',
  inboundRules: [],
  zone,
  tags,
})

// ---------------------------------------------------------------------------
// Shared .env content (all secrets, all DB URLs)
// ---------------------------------------------------------------------------

const dotEnv = pulumi.all([
  connectionStringRuntime,
  connectionStringAdmin,
  connectionStringCdc,
  cookieSecret,
  unsubscribeSecret,
  cdcSecret,
  yjsSecret,
  piiHashSecret,
  brevoApiKey,
  scwAiApiKey,
  adminEmail,
]).apply(([dbUrl, dbAdminUrl, dbCdcUrl, cookie, unsub, cdc, yjs, pii, brevo, aiApiKey, admin]) =>
  [
    `DATABASE_URL=${dbUrl}`,
    `DATABASE_ADMIN_URL=${dbAdminUrl}`,
    `DATABASE_CDC_URL=${dbCdcUrl}`,
    `COOKIE_SECRET=${cookie}`,
    `UNSUBSCRIBE_SECRET=${unsub}`,
    `CDC_SECRET=${cdc}`,
    `YJS_SECRET=${yjs}`,
    `PII_HASH_SECRET=${pii}`,
    `BREVO_API_KEY=${brevo}`,
    `SCW_AI_API_KEY=${aiApiKey}`,
    `ADMIN_EMAIL=${admin}`,
  ].join('\n'),
)

// ---------------------------------------------------------------------------
// Compose file content (read from deploy/compose.yml at deploy time)
// ---------------------------------------------------------------------------

import * as fs from 'node:fs'
import * as path from 'node:path'

const composeContent = fs.readFileSync(
  path.resolve(import.meta.dirname, '../compose.yml'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Cloud-init template
// ---------------------------------------------------------------------------

interface ServiceConfig {
  name: string
  profile: string
  imageTag: string
  /** Extra compose env vars (REGISTRY, URLs, tags) */
  composeEnv: Record<string, pulumi.Input<string>>
}

function buildCloudInit(service: ServiceConfig): pulumi.Output<string> {
  const envLines = pulumi.all(
    Object.entries(service.composeEnv).map(([k, v]) =>
      pulumi.output(v).apply((val) => `${k}=${val}`),
    ),
  )

  return pulumi.all([dotEnv, envLines, scwSecretKey, scwAccessKey, registryEndpoint]).apply(
    ([secrets, env, secretKey, accessKey, registry]) => {
      const allEnv = [...env, '', '# Secrets', secrets].join('\n')
      const bucket = naming.pulumiStateBucket
      const s3Endpoint = `https://s3.${region}.scw.cloud`

      return `#!/bin/bash
set -uo pipefail
# NOTE: intentionally no -e — we want stage markers to always upload so we
# can pinpoint which step failed. Each command uses || true where needed.

# -----------------------------------------------------------------------
# Stage markers: upload tiny files to S3 at each milestone, so even if the
# whole script aborts we can see how far it got.
# -----------------------------------------------------------------------
export AWS_ACCESS_KEY_ID='${accessKey}'
export AWS_SECRET_ACCESS_KEY='${secretKey}'
mark() {
  local tag="$1"
  local ts=$(date -u +%Y%m%dT%H%M%SZ)
  if command -v aws >/dev/null 2>&1; then
    echo "$tag at $ts on $(hostname)" \
      | aws --endpoint-url '${s3Endpoint}' s3 cp - \
        "s3://${bucket}/boot-diag/${service.name}-stage-$tag-$ts.txt" 2>&1 \
      | tee -a /var/log/mark.log || true
  else
    echo "$tag at $ts (aws missing)" >> /var/log/mark.log
  fi
}

# Stage 00 — install awscli first so we can mark every subsequent stage
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq awscli 2>&1 | tail -5
mark 00-started

# -----------------------------------------------------------------------
# Boot diagnostics — write snapshot script + schedule via systemd-run.
# -----------------------------------------------------------------------
mkdir -p /opt/diag
cat > /opt/diag/boot-diag.sh <<'DIAG_EOF'
#!/bin/bash
LOG=/tmp/boot-diag.log
{
  echo "=== uname / uptime ==="
  uname -a; uptime
  echo
  echo "=== cloud-init status ==="
  cloud-init status --long 2>&1 || true
  echo
  echo "=== cloud-init-output.log (tail 500) ==="
  tail -500 /var/log/cloud-init-output.log 2>/dev/null || echo "(missing)"
  echo
  echo "=== mark.log ==="
  cat /var/log/mark.log 2>/dev/null || echo "(no marks)"
  echo
  echo "=== docker ps -a ==="
  docker ps -a 2>&1 || echo "(docker missing)"
  echo
  echo "=== docker compose ps ==="
  (cd /opt/app 2>/dev/null && docker compose --profile ${service.profile} ps) 2>&1 || echo "(no compose)"
  echo
  echo "=== docker compose logs (tail 500) ==="
  (cd /opt/app 2>/dev/null && docker compose --profile ${service.profile} logs --no-color --tail=500) 2>&1 || echo "(no logs)"
} > "$LOG" 2>&1

AWS_ACCESS_KEY_ID='${accessKey}' AWS_SECRET_ACCESS_KEY='${secretKey}' \
  aws --endpoint-url '${s3Endpoint}' s3 cp "$LOG" \
  "s3://${bucket}/boot-diag/${service.name}-$(date -u +%Y%m%dT%H%M%SZ).log" 2>&1 || true
DIAG_EOF
chmod +x /opt/diag/boot-diag.sh
systemd-run --on-active=180 --unit=boot-diag-${service.name} /opt/diag/boot-diag.sh 2>&1 | tail -5
mark 05-diag-scheduled

# Install Docker from official repo (Ubuntu repos lack docker-compose-plugin)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update -qq 2>&1 | tail -5
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>&1 | tail -5
systemctl enable --now docker
mark 10-docker-installed

# App directory
mkdir -p /opt/app

# Write compose file
cat > /opt/app/compose.yml <<'COMPOSE_EOF'
${composeContent}
COMPOSE_EOF

# Write environment
cat > /opt/app/.env <<'ENV_EOF'
${allEnv}
ENV_EOF
chmod 600 /opt/app/.env
mark 20-files-written

# Login to container registry
echo '${secretKey}' | docker login ${registry.split('/')[0]} -u nologin --password-stdin
mark 30-registry-login

# Start service
cd /opt/app
PULL_OK=0
for i in $(seq 1 12); do
  if docker compose --profile ${service.profile} pull 2>&1 | tail -10; then
    PULL_OK=1; break
  fi
  echo "Pull attempt $i failed, retrying in 10s..."
  sleep 10
done
mark "40-pull-$([ $PULL_OK = 1 ] && echo ok || echo failed)"

docker compose --profile ${service.profile} up -d 2>&1 | tail -10
mark 50-compose-up

# Scrub secrets from cloud-init logs
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init-output.log 2>/dev/null || true
sed -i '/SECRET\\|PASSWORD\\|API_KEY\\|DATABASE_URL\\|docker login/Id' /var/log/cloud-init.log 2>/dev/null || true
`
    },
  )
}

// ---------------------------------------------------------------------------
// Service definitions
// ---------------------------------------------------------------------------

const backendUrl = hasDomain ? appUrls.backend : 'http://localhost:4000'
const frontendUrl = appUrls.frontend
const aiApiUrl = hasDomain ? appUrls.ai : 'http://localhost:4003'
const cdcWsUrl = hasDomain ? `wss://${domains.api}/internal/cdc` : 'ws://localhost:4000/internal/cdc'

const services: ServiceConfig[] = [
  {
    name: 'backend',
    profile: 'backend',
    imageTag: infra.backendImageTag,
    composeEnv: {
      REGISTRY: registryEndpoint,
      BACKEND_TAG: infra.backendImageTag,
      APP_MODE: mode,
      FRONTEND_URL: frontendUrl,
      BACKEND_URL: backendUrl,
    },
  },
  {
    name: 'cdc',
    profile: 'cdc',
    imageTag: infra.cdcImageTag,
    composeEnv: {
      REGISTRY: registryEndpoint,
      CDC_TAG: infra.cdcImageTag,
      APP_MODE: mode,
      API_WS_URL: cdcWsUrl,
      BACKEND_URL: backendUrl,
    },
  },
  {
    name: 'yjs',
    profile: 'yjs',
    imageTag: infra.yjsImageTag,
    composeEnv: {
      REGISTRY: registryEndpoint,
      YJS_TAG: infra.yjsImageTag,
      APP_MODE: mode,
      BACKEND_URL: backendUrl,
    },
  },
  {
    name: 'ai',
    profile: 'ai',
    imageTag: infra.aiWorkerImageTag,
    composeEnv: {
      REGISTRY: registryEndpoint,
      AI_TAG: infra.aiWorkerImageTag,
      APP_MODE: mode,
      FRONTEND_URL: frontendUrl,
      BACKEND_URL: backendUrl,
      AI_API_URL: aiApiUrl,
    },
  },
]

// ---------------------------------------------------------------------------
// Create VMs
// ---------------------------------------------------------------------------

export interface ComputeInstance {
  name: string
  server: scaleway.instance.Server
  privateIp: pulumi.Output<string>
}

const instances: ComputeInstance[] = []

if (infra.deployCompute) {
  for (const service of services) {
    // Each VM needs a public IP for internet access (package install, image pull)
    const ip = new scaleway.instance.Ip(`ip-${service.name}`, {
      zone,
      tags,
    })

    const server = new scaleway.instance.Server(`vm-${service.name}`, {
      name: naming.resource(service.name),
      type: infra.instanceType,
      image: 'ubuntu_noble',
      zone,
      tags,
      securityGroupId: securityGroup.id,
      cloudInit: buildCloudInit(service),
      ipIds: [ip.id],
      privateNetworks: [{
        pnId: privateNetworkId,
      }],
    }, {
      // cloud-init only runs on first boot; in-place updates would never apply new env/scripts to running VMs.
      replaceOnChanges: ['cloudInit'],
      // Delete old VM before creating new (IP can only be attached to one server)
      // CDC is additionally a singleton — must not run two at once.
      deleteBeforeReplace: true,
    })

    // The private IP is assigned by IPAM when attaching to the private network
    // Pick the IPv4 address (skip IPv6 SLAAC addresses)
    const privateIp = server.privateIps.apply(
      (ips) => ips?.find((ip) => ip.address && !ip.address.includes(':'))?.address ?? ips?.[0]?.address ?? '',
    )

    instances.push({ name: service.name, server, privateIp })
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/** All compute instances */
export const computeInstances = instances

/** Get a specific instance's private IP (for LB backend targets) */
export function getInstanceIp(name: string): pulumi.Output<string> {
  const inst = instances.find((i) => i.name === name)
  if (!inst) return pulumi.output('')
  return inst.privateIp
}
