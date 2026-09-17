import { EventEmitter } from 'node:events';

/** Auth lifecycle events for other modules. Sessions are not CDC-tracked, so they cannot travel the activity bus. */
export interface AuthEvents {
  /** Sessions ended by sign-out or termination, so connections bound to them can be closed. */
  'session.deleted': { userId: string; sessionIds: string[] };
}

type AuthEventHandler<K extends keyof AuthEvents> = (payload: AuthEvents[K]) => void | Promise<void>;

/** In-process emitter; handlers must catch their own errors, an async rejection would go unhandled. */
class AuthEventBus {
  private emitter = new EventEmitter();

  on<K extends keyof AuthEvents>(type: K, handler: AuthEventHandler<K>): this {
    this.emitter.on(type, handler);
    return this;
  }

  off<K extends keyof AuthEvents>(type: K, handler: AuthEventHandler<K>): this {
    this.emitter.off(type, handler);
    return this;
  }

  emit<K extends keyof AuthEvents>(type: K, payload: AuthEvents[K]): void {
    this.emitter.emit(type, payload);
  }
}

export const authEvents = new AuthEventBus();
