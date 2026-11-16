import { Kafka, logLevel } from 'kafkajs';

/**
 * Kafka driver (kafkajs). Same interface as MemoryBus.
 * Messages are JSON; the key decides the partition, so all frames of one PMU stay ordered.
 */
export class KafkaBus {
  constructor({ brokers, clientId = 'ieee123', topics = {}, log = console }) {
    this.kind = 'kafka'; this.log = log; this.topics = topics;
    this.kafka = new Kafka({ clientId, brokers, logLevel: logLevel.WARN, retry: { retries: 6 } });
    this.producer = this.kafka.producer({ allowAutoTopicCreation: false });
    this.admin = this.kafka.admin();
    this.consumers = [];
    this._lagCache = new Map();
    this._timer = null;
  }

  async connect() {
    await this.producer.connect();
    await this.admin.connect();
    const existing = new Set(await this.admin.listTopics());
    const toMake = Object.entries(this.topics).filter(([t]) => !existing.has(t))
      .map(([topic, partitions]) => ({ topic, numPartitions: partitions, replicationFactor: 1 }));
    if (toMake.length) await this.admin.createTopics({ topics: toMake, waitForLeaders: true });
    this._timer = setInterval(() => this._pollLag().catch(() => {}), 2000);
    this._timer.unref?.();
    return this;
  }

  async publish(topic, key, value) {
    await this.producer.send({ topic, messages: [{ key: String(key ?? ''), value: JSON.stringify(value) }] });
  }

  async subscribe(topic, group, handler, { fromBeginning = false } = {}) {
    const consumer = this.kafka.consumer({ groupId: group });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning });
    await consumer.run({
      eachMessage: async ({ message }) => {
        await handler(JSON.parse(message.value.toString()), { key: message.key?.toString(), offset: +message.offset, ts: +message.timestamp });
      },
    });
    this.consumers.push(consumer);
    this._lagCache.set(`${topic}|${group}`, 0);
  }

  async _pollLag() {
    for (const k of this._lagCache.keys()) {
      const [topic, groupId] = k.split('|');
      const end = await this.admin.fetchTopicOffsets(topic);
      const cur = await this.admin.fetchOffsets({ groupId, topics: [topic] });
      const pos = new Map((cur[0]?.partitions ?? []).map((p) => [p.partition, +p.offset]));
      this._lagCache.set(k, end.reduce((s, p) => s + Math.max(0, +p.offset - Math.max(0, pos.get(p.partition) ?? 0)), 0));
    }
  }
  async lag(topic, group) { return this._lagCache.get(`${topic}|${group}`) ?? 0; }

  async close() {
    clearInterval(this._timer);
    await Promise.allSettled(this.consumers.map((c) => c.disconnect()));
    await Promise.allSettled([this.producer.disconnect(), this.admin.disconnect()]);
  }
}
