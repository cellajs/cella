import * as pulumi from '@pulumi/pulumi'

interface StableSecretInputs {
  seed?: pulumi.Input<string | undefined>
}

interface StableSecretOutputs {
  seed?: string
  value: string
}

class StableSecretProvider implements pulumi.dynamic.ResourceProvider {
  async create(inputs: { seed?: string }) {
    const { randomBytes } = await import('node:crypto')
    const value = inputs.seed || randomBytes(32).toString('base64url')
    return {
      id: randomBytes(16).toString('hex'),
      outs: {
        ...inputs,
        value,
      } satisfies StableSecretOutputs,
    }
  }

  async diff() {
    // Stable by default: once created, the value lives in Pulumi state until a
    // future explicit rotation mechanism is added.
    return { changes: false }
  }
}

const provider = new StableSecretProvider()

export class StableSecret extends pulumi.dynamic.Resource {
  declare readonly value: pulumi.Output<string>

  constructor(name: string, args: StableSecretInputs = {}, opts?: pulumi.CustomResourceOptions) {
    super(provider, name, args, {
      ...opts,
      additionalSecretOutputs: ['value'],
    })
  }
}