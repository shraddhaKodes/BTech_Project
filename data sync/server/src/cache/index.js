import { MemoryStore } from './memoryStore.js';

/** Redis when REDIS_URL is set (and reachable), otherwise the in-process store. */
export async function createStore(cfg, log = console) {
  if (cfg.redisUrl) {
    try {
      const { RedisStore } = await import('./redisStore.js');
      const s = await new RedisStore(cfg.redisUrl, log).connect();
      log.log(`[cache] Redis connected (${cfg.redisUrl})`);
      return s;
    } catch (e) {
      log.warn(`[cache] Redis unavailable (${e.message.split('\n')[0]}) – falling back to the in-process store`);
    }
  }
  log.log('[cache] using the in-process store (set REDIS_URL to use Redis)');
  return new MemoryStore();
}
