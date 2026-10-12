import dgram from "node:dgram";
import { WebSocketServer, WebSocket } from "ws";

const udp = dgram.createSocket("udp4");

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: 9000
});

wss.on("listening", () => {
  console.log("WebSocket server: ws://127.0.0.1:9000");
});

udp.on("message", (msg) => {
  // One double-precision sample per UDP packet
  if (msg.length < 8) return;

  const value = msg.readDoubleBE(0);

  const data = JSON.stringify({
    signal: "sineWave",
    value,
    timestamp: Date.now()
  });

  console.log(data);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
});

udp.bind(9001, "127.0.0.1", () => {
  console.log("UDP receiver listening on port 9001");
});