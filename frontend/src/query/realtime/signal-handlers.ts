import type { StreamSignal } from 'sdk';
import { onFrontendModuleRegister } from '~/lib/module';

/** `missed` is true when catchup found a version this client had not seen: there is no frame, only its type and organization. */
export type StreamSignalHandler = (signal: StreamSignal, context: { missed: boolean }) => void;

/** Handlers by signal type, filled through `onFrontendModuleRegister`, which replays modules registered earlier. */
const handlers = new Map<string, StreamSignalHandler[]>();

onFrontendModuleRegister((module) => {
  for (const [type, handler] of Object.entries(module.signals ?? {})) {
    if (!handler) continue;
    handlers.set(type, [...(handlers.get(type) ?? []), handler]);
  }
});

/** Runs the handlers of a signal's type. A type this bundle does not know is ignored, so a tab older than the server keeps working. */
export function handleStreamSignal(signal: StreamSignal, missed = false): void {
  const registered = handlers.get(signal.type) ?? [];
  if (registered.length === 0) console.debug('[StreamSignal] No handler for type', signal.type);
  for (const handler of registered) {
    try {
      handler(signal, { missed });
    } catch (error) {
      console.error(`[StreamSignal] ${signal.type} handler failed:`, error);
    }
  }
}
