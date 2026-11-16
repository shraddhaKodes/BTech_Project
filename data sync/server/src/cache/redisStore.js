import Redis from 'ioredis';

/** Redis driver (ioredis). Same interface as MemoryStore. */
export class RedisStore {
  constructor(url, log = console) {
    this.kind = 'redis'; this.log = log;
    this.r = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    this.reader = this.r.duplicate();        // blocking XREAD needs its own connection
  }
  async connect() { await this.r.connect(); await this.reader.connect(); return this; }

  zadd(key, score, member) { return this.r.zadd(key, score, JSON.stringify(member)); }
  _pair(r) { return r.length ? { score: +r[1], member: JSON.parse(r[0]) } : null; }
  async zbefore(key, t) { return this._pair(await this.r.zrevrangebyscore(key, t, '-inf', 'WITHSCORES', 'LIMIT', 0, 1)); }
  async zafter(key, t) { return this._pair(await this.r.zrangebyscore(key, `(${t}`, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)); }
  async zlatest(key) { return this._pair(await this.r.zrevrange(key, 0, 0, 'WITHSCORES')); }
  async zoldest(key) { return this._pair(await this.r.zrange(key, 0, 0, 'WITHSCORES')); }
  ztrim(key, minScore) { return this.r.zremrangebyscore(key, '-inf', `(${minScore}`); }
  zcount(key) { return this.r.zcard(key); }

  set(key, obj) { return this.r.set(key, JSON.stringify(obj)); }
  async get(key) { const v = await this.r.get(key); return v == null ? null : JSON.parse(v); }

  xadd(stream, obj, maxlen = 2000) { return this.r.xadd(stream, 'MAXLEN', '~', maxlen, '*', 'd', JSON.stringify(obj)); }
  async xread(stream, lastId, blockMs = 200) {
    const res = await this.reader.xread('COUNT', 200, 'BLOCK', blockMs, 'STREAMS', stream, lastId);
    if (!res) return [];
    return res[0][1].map(([id, f]) => ({ id, obj: JSON.parse(f[1]) }));
  }
  async close() { await Promise.allSettled([this.r.quit(), this.reader.quit()]); }
}
