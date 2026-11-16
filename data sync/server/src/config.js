const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(+v) ? +v : d);
const bool = (v, d) => (v === undefined || v === '' ? d : !['0', 'false', 'no', 'off'].includes(String(v).toLowerCase()));
export const config = {
  httpPort: num(process.env.PORT, 4000),
  udpPort: num(process.env.UDP_PORT, 5005),
  udpHost: process.env.UDP_HOST || '0.0.0.0',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ieee123',
  vBaseLN: num(process.env.V_BASE_LN, 2401.78),      // 4160 V LL / sqrt(3)
  emitHz: num(process.env.WS_EMIT_HZ, 10),
  dbIntervalMs: num(process.env.DB_SAVE_INTERVAL_MS, 1000),
  historyLen: num(process.env.HISTORY_LEN, 600),     // samples kept in RAM per bus
  retentionHours: num(process.env.RETENTION_HOURS, 24),
  staleMs: 3000,
  // --- two-PMU synchronisation pipeline ---
  pmuEnabled: bool(process.env.PMU_ENABLED, true),
  sectorsFile: process.env.SECTORS_FILE || '',                 // default: server/data/sectors.json
  kafkaBrokers: (process.env.KAFKA_BROKERS || '').split(',').map((s) => s.trim()).filter(Boolean),
  redisUrl: process.env.REDIS_URL || '',
  sync: {
    outHz: num(process.env.SYNC_OUT_HZ, 50),                   // common output grid
    latenessMs: num(process.env.SYNC_LATENESS_MS, 25),         // watermark slack for reordered samples
    stallMs: num(process.env.SYNC_STALL_MS, 1000),             // PMU silent this long → marked stale, last data held
    retainMs: 3000, maxBacklogMs: 500, tickMs: 10,
  },
  limits: { normal: [0.95, 1.05], warn: [0.9, 1.1] }, // ANSI C84.1-style bands (per-unit)
};
