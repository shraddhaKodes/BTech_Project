import dotenv from "dotenv";

import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import startTcpServer from './src/services/tcpServer.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
   startTcpServer();   // later: startTcpServer(io)
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
