import mongoose from 'mongoose';

export const db = { ready: false };

export async function connectDb(uri, log = console) {
  mongoose.connection.on('connected', () => { db.ready = true; });
  mongoose.connection.on('disconnected', () => { db.ready = false; });
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
    db.ready = true;
    log.log('[db] MongoDB connected');
  } catch (e) {
    db.ready = false;
    log.warn(`[db] MongoDB not reachable (${e.message.split('\n')[0]}). Running in memory-only mode: live view works, history is limited to RAM.`);
  }
  return db.ready;
}
