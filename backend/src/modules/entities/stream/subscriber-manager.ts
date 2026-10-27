import type { BaseStreamSubscriber } from './types';

/** The routing key of a user's own stream events: its membership changes and the end of its sessions. */
export const userStreamKey = (userId: string) => `user:${userId}`;

/** The routing key of an organization's product events. */
export const organizationStreamKey = (organizationId: string) => `org:${organizationId}`;

/** O(1) lookup by channel; a subscriber may register on several channels. */
class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byChannel = new Map<string, Set<string>>();
  /** Every channel each subscriber registered on, so unregister leaves its id in none. */
  private channelsOf = new Map<string, Set<string>>();

  /**
   * The primary channel is `subscriber.channel`; additional ones cover multi-org routing.
   * @example
   * manager.register(subscriber, [...organizationIds].map(organizationStreamKey));
   */
  register<T extends BaseStreamSubscriber>(subscriber: T, additionalChannels: string[] = []): void {
    this.subscribers.set(subscriber.id, subscriber);

    const channels = this.channelsOf.get(subscriber.id) ?? new Set<string>();
    for (const channel of [subscriber.channel, ...additionalChannels]) {
      if (!channel) continue;
      channels.add(channel);
      let set = this.byChannel.get(channel);
      if (!set) {
        set = new Set();
        this.byChannel.set(channel, set);
      }
      set.add(subscriber.id);
    }
    this.channelsOf.set(subscriber.id, channels);
  }

  /** Removes the subscriber from every channel it registered on. */
  unregister(id: string): void {
    for (const channel of this.channelsOf.get(id) ?? []) {
      const set = this.byChannel.get(channel);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.byChannel.delete(channel);
        }
      }
    }

    this.channelsOf.delete(id);
    this.subscribers.delete(id);
  }

  /** Total registered subscribers (across all streams). */
  get size(): number {
    return this.subscribers.size;
  }

  /** Every registered subscriber, for checks that cover all open streams. */
  all(): BaseStreamSubscriber[] {
    return Array.from(this.subscribers.values());
  }

  /** The subscribers registered on a channel; the caller names the subscriber type it registered there. */
  getByChannel<T extends BaseStreamSubscriber>(channel: string): T[] {
    return Array.from(this.byChannel.get(channel) ?? [], (id) => this.subscribers.get(id) as T);
  }
}

export const streamSubscriberManager = new StreamSubscriberManager();
