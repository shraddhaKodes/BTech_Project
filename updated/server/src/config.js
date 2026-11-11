const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(+v) ? +v : d);
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
  limits: { normal: [0.95, 1.05], warn: [0.9, 1.1] }, // ANSI C84.1-style bands (per-unit)
};
