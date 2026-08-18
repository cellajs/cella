import type { BaseStreamSubscriber } from './types';

/** O(1) lookup by channel; a subscriber may register on several channels. */
class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byChannel = new Map<string, Set<string>>();

  /**
   * The primary channel is `subscriber.channel`; additional ones cover multi-org routing.
   * @example
   * const orgChannels = [...organizationIds].map(id => `org:${id}`);
   * manager.register(subscriber, orgChannels);
   */
  register<T extends BaseStreamSubscriber>(subscriber: T, additionalChannels: string[] = []): void {
    this.subscribers.set(subscriber.id, subscriber);

    const allChannels = [subscriber.channel, ...additionalChannels].filter(Boolean) as string[];
    for (const channel of allChannels) {
      let set = this.byChannel.get(channel);
      if (!set) {
        set = new Set();
        this.byChannel.set(channel, set);
      }
      set.add(subscriber.id);
    }

    // Stored for cleanup on unregister.
    subscriber._channels = allChannels;
  }

  /** Removes the subscriber from every channel it registered on. */
  unregister(id: string): void {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return;

    const allChannels = subscriber._channels ?? [subscriber.channel].filter(Boolean);
    for (const channel of allChannels) {
      if (!channel) continue;
      const set = this.byChannel.get(channel);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.byChannel.delete(channel);
        }
      }
    }

    this.subscribers.delete(id);
  }

  /** Total registered subscribers (across all streams). */
  get size(): number {
    return this.subscribers.size;
  }

  getByChannel<T extends BaseStreamSubscriber>(channel: string): T[] {
    const ids = this.byChannel.get(channel);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscribers.get(id) as T)
      .filter(Boolean);
  }
}

export const streamSubscriberManager = new StreamSubscriberManager();
