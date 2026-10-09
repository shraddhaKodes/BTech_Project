
import net from 'net';
import Measurement from '../models/Measurement.js'; 

export default function startTcpServer(io = null, port = process.env.TCP_PORT || 6000) {
  const server = net.createServer((socket) => {
    console.log(`[tcp] client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.setEncoding('utf8');
    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;

        try {
          const msg = JSON.parse(line);

          if (!msg.voltage?.a || !msg.voltage?.b || !msg.voltage?.c) {
            throw new Error('voltage.a / voltage.b / voltage.c are required');
          }

          const latencyMs = msg.sentAt ? Date.now() - msg.sentAt : null;

          const doc = await Measurement.create({
            ...msg,
            timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          });

          io?.emit('measurement', doc); // used later by the React dashboard

          socket.write(JSON.stringify({ ok: true, id: doc._id, latencyMs }) + '\n');
        } catch (err) {
          console.error('[tcp] bad message:', err.message);
          socket.write(JSON.stringify({ ok: false, error: err.message }) + '\n');
        }
      }
    });

    socket.on('error', (e) => console.error('[tcp] socket error:', e.message));
    socket.on('close', () => console.log('[tcp] client disconnected'));
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[tcp] server listening on 127.0.0.1:${port}`);
  });

  return server;
}

