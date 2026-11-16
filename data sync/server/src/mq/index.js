import { MemoryBus } from './memoryBus.js';

export const TOPICS = { raw: 'pmu.raw', aligned: 'pmu.aligned', dlq: 'pmu.dlq' };

/** Kafka when KAFKA_BROKERS is set (and reachable), otherwise the in-process bus. */
export async function createBus(cfg, log = console) {
  if (cfg.kafkaBrokers.length) {
    try {
      const { KafkaBus } = await import('./kafkaBus.js');
      const bus = new KafkaBus({ brokers: cfg.kafkaBrokers, topics: { [TOPICS.raw]: 2, [TOPICS.aligned]: 1, [TOPICS.dlq]: 1 }, log });
      await bus.connect();
      log.log(`[mq] Kafka connected (${cfg.kafkaBrokers.join(',')})`);
      return bus;
    } catch (e) {
      log.warn(`[mq] Kafka unavailable (${e.message.split('\n')[0]}) – falling back to the in-process bus`);
    }
  }
  log.log('[mq] using the in-process bus (set KAFKA_BROKERS to use Kafka)');
  return new MemoryBus();
}
