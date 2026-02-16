import type { BaseStreamSubscriber } from './types';

/**
 * Subscriber manager with multi-channel routing.
 * Stores subscribers and provides O(1) lookup by channel.
 * Subscribers can register on multiple channels to receive events from different sources.
 */
class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byChannel = new Map<string, Set<string>>();

  /**
   * Register a subscriber on one or more channels.
   * Primary channel is on subscriber.channel, additional channels for multi-org routing.
   *
   * @example
   * // App stream subscribes to user channel + all org channels
   * const orgChannels = [...orgIds].map(id => `org:${id}`);
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

    // Store all channels for cleanup on unregister
    subscriber._channels = allChannels;
  }

  /**
   * Unregister a subscriber by ID.
   * Removes from all channels it was registered on.
   */
  unregister(id: string): void {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return;

    // Remove from ALL channels
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

  /**
   * Get subscribers on a channel - O(1) lookup.
   */
  getByChannel<T extends BaseStreamSubscriber>(channel: string): T[] {
    const ids = this.byChannel.get(channel);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscribers.get(id) as T)
      .filter(Boolean);
  }
}

/** Singleton subscriber manager instance */
export const streamSubscriberManager = new StreamSubscriberManager();
