import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';

/** The topic of a user's own stream events: its membership changes and the end of its sessions. */
export const userTopic = (userId: string) => `user:${userId}`;

/** The topic of an organization's product events. */
export const organizationTopic = (organizationId: string) => `org:${organizationId}`;

/** O(1) lookup by topic; a subscriber may register on several topics. */
class StreamSubscriberManager {
  private subscribers = new Map<string, AppStreamSubscriber>();
  private byTopic = new Map<string, Set<string>>();
  /** Every topic each subscriber registered on, so unregister leaves its id in none. */
  private topicsOf = new Map<string, Set<string>>();

  /**
   * Registers on `subscriber.topic` and on each of `additionalTopics`, such as one per organization.
   * @example
   * manager.register(subscriber, [...organizationIds].map(organizationTopic));
   */
  register(subscriber: AppStreamSubscriber, additionalTopics: string[] = []): void {
    this.subscribers.set(subscriber.id, subscriber);

    const topics = this.topicsOf.get(subscriber.id) ?? new Set<string>();
    for (const topic of [subscriber.topic, ...additionalTopics]) {
      if (!topic) continue;
      topics.add(topic);
      let set = this.byTopic.get(topic);
      if (!set) {
        set = new Set();
        this.byTopic.set(topic, set);
      }
      set.add(subscriber.id);
    }
    this.topicsOf.set(subscriber.id, topics);
  }

  /** Removes the subscriber from every topic it registered on. */
  unregister(id: string): void {
    for (const topic of this.topicsOf.get(id) ?? []) {
      const set = this.byTopic.get(topic);
      if (set) {
        set.delete(id);
        if (set.size === 0) this.byTopic.delete(topic);
      }
    }

    this.topicsOf.delete(id);
    this.subscribers.delete(id);
  }

  /** Total registered subscribers. */
  get size(): number {
    return this.subscribers.size;
  }

  /** Every registered subscriber, for checks that cover all open streams. */
  all(): AppStreamSubscriber[] {
    return Array.from(this.subscribers.values());
  }

  /** The subscribers registered on a topic. */
  getByTopic(topic: string): AppStreamSubscriber[] {
    return [...(this.byTopic.get(topic) ?? [])].flatMap((id) => this.subscribers.get(id) ?? []);
  }
}

/** The open SSE streams of this process, by topic. */
export const streamSubscriberManager = new StreamSubscriberManager();
