import net from "node:net";

import { config } from "../config/env.js";
import { ingestMeasurement } from "./ingestion.js";

// A whole-step packet is a few kilobytes. A sender that never terminates a line
// has a protocol bug, and buffering it forever would only hide that.
const MAX_BUFFER_BYTES = 1024 * 1024;

const writeReply = (socket, payload) => {
  if (socket.writable) {
    socket.write(`${JSON.stringify(payload)}\n`);
  }
};

const failureReply = (message) => ({
  ok: false,
  stored: 0,
  rejected: 0,
  duplicates: 0,
  latencyMs: null,
  errors: [message],
});

const handleLine = async (socket, line) => {
  console.log(`[tcp] received packet: ${line}`);

  let packet;

  try {
    packet = JSON.parse(line);
  } catch (error) {
    const reply = failureReply(`Invalid JSON: ${error.message}`);
    console.warn("[tcp] rejected packet:", JSON.stringify(reply));
    writeReply(socket, reply);
    return;
  }

  try {
    const result = await ingestMeasurement(packet);
    console.log(`[tcp] ingestion result: ${JSON.stringify(result)}`);
    writeReply(socket, result);
  } catch (error) {
    console.error("[tcp] ingestion failed:", error.message);
    const reply = failureReply(error.message);
    console.warn("[tcp] rejected packet:", JSON.stringify(reply));
    writeReply(socket, reply);
  }
};

export default function startTcpServer(port = config.tcpPort, host = config.tcpHost) {
  const server = net.createServer((socket) => {
    console.log(`[tcp] client connected: ${socket.remoteAddress}:${socket.remotePort}`);
    socket.setEncoding("utf8");

    let buffer = "";
    // Ingestion is awaited off the data event, so lines are handled one at a time
    // in arrival order; mutating `buffer` from an async handler would race.
    let chain = Promise.resolve();

    socket.on("data", (chunk) => {
      buffer += chunk;

      if (!buffer.includes("\n") && buffer.length > MAX_BUFFER_BYTES) {
        writeReply(socket, failureReply("Message exceeded 1 MB without a newline."));
        socket.destroy();
        return;
      }

      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);

        if (line) {
          chain = chain.then(() => handleLine(socket, line));
        }
      }
    });

    socket.on("error", (error) => console.error("[tcp] socket error:", error.message));
    socket.on("close", () => console.log("[tcp] client disconnected"));
  });

  server.listen(port, host, () => {
    console.log(`[tcp] server listening on ${host}:${port}`);
  });

  return server;
}
