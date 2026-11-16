import { createBus } from '../mq/index.js';
import { createStore } from '../cache/index.js';
import { startPmuIngest } from './ingest.js';
import { startCorrector } from './corrector.js';
import { startAligner, ALIGNED_STREAM } from './aligner.js';
import { newMetrics, snapshot } from './metrics.js';

/**
 * Wires ingest → Kafka(pmu.raw) → corrector → Redis ZSETs → aligner → Redis Stream + Kafka(pmu.aligned) → gateway(LiveState).
 * `bus` / `store` may be injected (tests); otherwise they are created from the config (Kafka/Redis or in-process).
 */
export async function startPipeline({ cfg, sectors, state, bus, store, log = console, ingest = true }) {
  bus ??= await createBus(cfg, log);
  store ??= await createStore(cfg, log);
  const metrics = newMetrics(sectors, { mq: bus.kind, cache: store.kind });
  const ing = ingest ? startPmuIngest({ sectors, bus, metrics, log }) : null;
  await startCorrector({ bus, store, metrics, sectors, log });
  const aligner = startAligner({ bus, store, metrics, sectors, cfg, log });

  // gateway: tail the aligned stream and feed the same LiveState the websocket/REST layer already uses
  let running = true, lastId = '$';
  (async () => {
    while (running) {
      try {
        const entries = await store.xread(ALIGNED_STREAM, lastId, 200);
        for (const e of entries) { lastId = e.id; state.apply(e.obj.simTime, e.obj.rows); state.stats.alignedQuality = e.obj.quality; }
      } catch (err) { log.warn('[gateway]', err.message); await new Promise((r) => setTimeout(r, 500)); }
    }
  })();

  return {
    metrics, bus, store,
    snapshot: () => snapshot(metrics),
    async stop() { running = false; aligner.stop(); ing?.close(); await bus.close(); await store.close(); },
  };
}
