import axios from "axios";

const getMlServiceUrl = () => {
  const baseUrl = process.env.ML_SERVICE_URL;

  if (!baseUrl) {
    const error = new Error("ML_SERVICE_URL is required but was not provided.");
    error.statusCode = 500;
    throw error;
  }

  return baseUrl.replace(/\/$/, "");
};

export const predict = async (values) => {
  try {
    const response = await axios.post(
      `${getMlServiceUrl()}/predict`,
      { values },
      { timeout: 5000 }
    );

    return response.data;
  } catch (error) {
    const serviceError = new Error("ML service request failed.");
    serviceError.statusCode = 502;

    if (error.response) {
      serviceError.message = "ML service returned an error.";
      serviceError.details = error.response.data;
    } else if (error.code === "ECONNABORTED") {
      serviceError.message = "ML service request timed out.";
    } else if (error.request) {
      serviceError.message = "ML service is unavailable.";
    }

    throw serviceError;
  }
};
