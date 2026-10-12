import axios from "axios";

import { config } from "../config/env.js";

const PREDICT_TIMEOUT_MS = 5000;
const HEALTH_TIMEOUT_MS = 2000;

export class MlServiceError extends Error {
  constructor(message, { statusCode = 502, unreachable = false, details = null } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.unreachable = unreachable;
    this.details = details;
  }
}

const toServiceError = (error) => {
  if (error.response) {
    return new MlServiceError("ML service returned an error.", {
      statusCode: 502,
      details: error.response.data,
    });
  }

  if (error.code === "ECONNABORTED") {
    return new MlServiceError("ML service request timed out.", { unreachable: true });
  }

  if (error.request) {
    return new MlServiceError("ML service is unavailable.", { unreachable: true });
  }

  return new MlServiceError("ML service request failed.", { details: error.message });
};

/**
 * @param {string} bus
 * @param {number} horizon forecast steps ahead
 * @param {Array<{step:number, timestamp:Date, loadFactor:number|null, voltage:object}>} history
 *   oldest first, exactly HISTORY_L items
 */
export const predictVoltages = async ({ bus, horizon, history }) => {
  try {
    const response = await axios.post(
      `${config.mlServiceUrl}/predict`,
      { bus, horizon, history },
      { timeout: PREDICT_TIMEOUT_MS }
    );

    return response.data;
  } catch (error) {
    throw toServiceError(error);
  }
};

export const checkMlService = async () => {
  try {
    const response = await axios.get(`${config.mlServiceUrl}/health`, {
      timeout: HEALTH_TIMEOUT_MS,
    });

    return { reachable: true, status: response.status, url: config.mlServiceUrl };
  } catch (error) {
    return {
      reachable: false,
      status: error.response?.status ?? null,
      url: config.mlServiceUrl,
      error: error.response ? "ML service returned an error." : error.message,
    };
  }
};
