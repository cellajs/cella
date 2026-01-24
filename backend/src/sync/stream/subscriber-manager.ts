import type { BaseStreamSubscriber } from './types';

/**
 * Subscriber manager with optional indexing.
 * Stores subscribers and provides O(1) lookup by index key.
 * All routing/filtering logic lives in handlers.
 */
class StreamSubscriberManager {
  private subscribers = new Map<string, BaseStreamSubscriber>();
  private byIndex = new Map<string, Set<string>>();

  /**
   * Register a subscriber.
   * If indexKey is provided, subscriber is indexed for fast lookup.
   */
  register<T extends BaseStreamSubscriber>(subscriber: T): void {
    this.subscribers.set(subscriber.id, subscriber);

    if (subscriber.indexKey) {
      let set = this.byIndex.get(subscriber.indexKey);
      if (!set) {
        set = new Set();
        this.byIndex.set(subscriber.indexKey, set);
      }
      set.add(subscriber.id);
    }
  }

  /**
   * Unregister a subscriber by ID.
   */
  unregister(id: string): void {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return;

    // Remove from index
    if (subscriber.indexKey) {
      const set = this.byIndex.get(subscriber.indexKey);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.byIndex.delete(subscriber.indexKey);
        }
      }
    }

    this.subscribers.delete(id);
  }

  /**
   * Get subscribers by index key - O(1) lookup.
   */
  getByIndex<T extends BaseStreamSubscriber>(key: string): T[] {
    const ids = this.byIndex.get(key);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.subscribers.get(id) as T)
      .filter(Boolean);
  }
}

/** Singleton subscriber manager instance */
export const streamSubscriberManager = new StreamSubscriberManager();
