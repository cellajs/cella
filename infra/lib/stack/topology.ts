/**
 * Stack topology of a deployment. `monolith` (default): one stack owns
 * foundation and generations, exactly the pre-split behavior. `micro`
 * (INFRA_STACK_TOPOLOGY=micro): the existing stack becomes the foundation
 * (INFRA_STACK_SCOPE=foundation on its updates) and each service's VM
 * generations live in their own `<mode>-gen-<slug>` stack, so wave updates run
 * per service in parallel with independent state and blast radius. Adopting
 * micro needs no state surgery: gen stacks provision fresh generations, the
 * cutover moves traffic, and the next foundation update reaps the VMs it no
 * longer scopes.
 */
export type StackTopology = 'monolith' | 'micro'

export function stackTopology(): StackTopology {
  return process.env.INFRA_STACK_TOPOLOGY === 'micro' ? 'micro' : 'monolith'
}

/** Stack that owns one service's generations under the micro topology. */
export function generationStackName(foundationStack: string, service: string): string {
  return `${foundationStack}-gen-${service}`
}
