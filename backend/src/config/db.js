import mongoose from "mongoose";

import { config } from "./env.js";

const connectDB = async () => {
  if (!config.mongoUri) {
    throw new Error("MONGODB_URI is required but was not provided.");
  }

  try {
    const connection = await mongoose.connect(config.mongoUri);
    console.log(`MongoDB connected: ${connection.connection.host}/${connection.connection.name}`);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

export default connectDB;
