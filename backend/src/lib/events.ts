import { EventEmitter } from 'node:events';
import type { z } from 'zod';
import type { membershipBaseSchema } from '#/modules/memberships/schema';

// TODO get rid of this
type Events = {
  instantMembershipCreation: z.infer<typeof membershipBaseSchema>;
  acceptedMembership: z.infer<typeof membershipBaseSchema>;
};

// biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
class TypedEventEmitter<Events extends Record<string | symbol, any>> extends EventEmitter {
  override emit<K extends keyof Events>(event: K, payload: Events[K]): boolean {
    return super.emit(event as string, payload);
  }

  override on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this {
    return super.on(event as string, listener);
  }
}

export const eventManager = new TypedEventEmitter<Events>();
