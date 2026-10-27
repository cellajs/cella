import { onBackendModuleRegister } from '#/lib/module';
import type { Audience } from '#/modules/entities/stream/audiences';
import { log } from '#/utils/logger';

/** Declared signal types and their audiences, filled through `onBackendModuleRegister`, which replays earlier modules. */
const declared = new Map<string, Set<Audience['kind']>>();

onBackendModuleRegister((module) => {
  for (const { type, audiences } of module.signals ?? []) {
    if (declared.has(type)) log.error('Signal type declared twice; the later declaration wins', { type, module: module.name });
    declared.set(type, new Set(audiences));
  }
});

/** Whether a module declared `type` for this kind of audience. */
export function isDeclaredSignal(type: string, audience: Audience['kind']): boolean {
  return declared.get(type)?.has(audience) ?? false;
}
