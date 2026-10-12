import { Server } from "socket.io";

import { config } from "../config/env.js";
import { getStats } from "./stats.js";

const STATUS_INTERVAL_MS = 5000;

let io = null;

export const initSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);
    socket.emit("status", getStats());
  });

  // unref so a periodic status ping never keeps the process alive on its own.
  setInterval(() => io?.emit("status", getStats()), STATUS_INTERVAL_MS).unref();

  console.log(`[socket] Socket.IO attached, CORS origins: ${config.corsOrigins.join(", ")}`);

  return io;
};

export const emitEvent = (event, payload) => {
  io?.emit(event, payload);
};

export const socketCount = () => io?.engine?.clientsCount ?? 0;
